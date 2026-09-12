#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createPerformerSearchRegistry } from "./performer-search-data.mjs";

const API_BASE_URL = "https://api.portal.nakvis.si/api/v1";
const PORTAL_URL = "https://portal.nakvis.si";
const LOCATIONS_ONLY = process.argv.includes("--locations-only");
const positionalArguments = process.argv.slice(2).filter(
  (argument) => !argument.startsWith("--"),
);
const OUTPUT_PATH = resolve(
  positionalArguments[0] ?? "data/slovenia-higher-education.json",
);
const TEACHERS_OUTPUT_PATH = resolve(
  positionalArguments[1] ??
    resolve(dirname(OUTPUT_PATH), "programme-teachers.json"),
);
const PERFORMER_SEARCH_OUTPUT_PATH = resolve(
  positionalArguments[2] ??
    resolve(dirname(OUTPUT_PATH), "programme-performer-search.json"),
);
const PAGE_SIZE = 100;
const TEACHER_FETCH_CONCURRENCY = 8;
const INSTITUTION_FETCH_CONCURRENCY = 4;
const PROGRAMME_FETCH_CONCURRENCY = 8;

const programmeTypes = {
  0: { name: "Neznano", name_en: "Unknown", short_name: null },
  1: { name: "Univerzitetni", name_en: "Academic", short_name: "UN" },
  2: {
    name: "Visokošolski strokovni",
    name_en: "Professional higher education",
    short_name: "VS",
  },
  3: {
    name: "Enoviti magistrski",
    name_en: "Integrated master's",
    short_name: "EMAG",
  },
  5: { name: "Doktorski", name_en: "Doctoral", short_name: "DR" },
  6: {
    name: "Za izpopolnjevanje",
    name_en: "Supplementary",
    short_name: "IZPOP",
  },
  7: { name: "Magistrski", name_en: "Master's", short_name: "MAG" },
};

const programmeCycles = {
  "0.": {
    number: 0,
    name: "Ne da nove stopnje",
    name_en: "Cycle not classified",
  },
  "I.": { number: 1, name: "Prva stopnja", name_en: "First cycle" },
  "II.": { number: 2, name: "Druga stopnja", name_en: "Second cycle" },
  "III.": { number: 3, name: "Tretja stopnja", name_en: "Third cycle" },
};

async function fetchJson(path, attempt = 1) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { accept: "application/json" },
    });
  } catch (error) {
    if (attempt < 4) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, attempt * 750),
      );
      return fetchJson(path, attempt + 1);
    }
    throw error;
  }

  if (!response.ok) {
    if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, attempt * 750),
      );
      return fetchJson(path, attempt + 1);
    }
    const error = new Error(
      `NAKVIS request failed (${response.status}): ${path}`,
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function fetchAllPages(resource, sortBy) {
  const firstPage = await fetchJson(
    `/${resource}?page=1&perPage=${PAGE_SIZE}&sortBy=${sortBy}&sortOrder=asc`,
  );
  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) => index + 2).map(
      (page) =>
        fetchJson(
          `/${resource}?page=${page}&perPage=${PAGE_SIZE}&sortBy=${sortBy}&sortOrder=asc`,
        ),
    ),
  );

  return [firstPage, ...remainingPages].flatMap((page) => page.data);
}

function flattenHierarchy(hierarchy) {
  const records = [];
  const parentUniversityById = new Map();

  for (const entry of hierarchy) {
    if (entry._id === "independent") {
      records.push(...(entry.children ?? []));
      continue;
    }

    records.push(entry);
    for (const member of entry.members ?? []) {
      records.push(member);
      parentUniversityById.set(member._id, entry._id);
    }
  }

  return { records, parentUniversityById };
}

function countBy(items, selectKey) {
  return Object.fromEntries(
    [...items.reduce((counts, item) => {
      const key = selectKey(item) ?? "null";
      counts.set(String(key), (counts.get(String(key)) ?? 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right, "sl")),
  );
}

function nullable(value) {
  return value ?? null;
}

function normalizeTeacher(teacher) {
  return {
    researcher_code: teacher.sifra || null,
    sicris_internal_id: nullable(teacher.sicris_internal_id),
    name: teacher.ime,
    courses: (teacher.courses ?? []).map((course) => ({
      code: course.sifra || null,
      name: course.ime,
      name_en: nullable(course.ime_ang),
    })),
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );

  return results;
}

async function fetchProgrammeTeacherRecords(programmes) {
  let completedCount = 0;

  return mapWithConcurrency(
    programmes,
    TEACHER_FETCH_CONCURRENCY,
    async (programme) => {
      try {
        const teachers = await fetchJson(
          `/study-programmes/${programme.id}/teachers`,
        );
        if (!Array.isArray(teachers)) {
          throw new Error(
            `Unexpected teachers response for programme ${programme.id}`,
          );
        }

        return {
          programme_id: programme.id,
          evs_code: programme.evs_code,
          name: programme.name,
          available: true,
          teachers: teachers.map(normalizeTeacher),
        };
      } catch (error) {
        if (error.status !== 404) throw error;

        return {
          programme_id: programme.id,
          evs_code: programme.evs_code,
          name: programme.name,
          available: false,
          teachers: [],
        };
      } finally {
        completedCount += 1;
        if (
          completedCount % 100 === 0 ||
          completedCount === programmes.length
        ) {
          console.log(
            `Fetched teacher data for ${completedCount}/${programmes.length} study programmes`,
          );
        }
      }
    },
  );
}

function normalizeStudyLocations(institution) {
  const locations = (institution.kraji_izvajanja ?? [])
    .map((location) => location.naziv_enote || location.posta)
    .filter(Boolean)
    .map((location) => location.trim());
  const registeredLocation = institution.naslov?.posta?.trim();
  if (locations.length === 0 && registeredLocation) locations.push(registeredLocation);
  return [...new Set(locations)].sort((left, right) =>
    left.localeCompare(right, "sl"));
}

async function fetchInstitutionStudyLocations(institutions) {
  let completedCount = 0;
  const entries = await mapWithConcurrency(
    institutions,
    INSTITUTION_FETCH_CONCURRENCY,
    async (institution) => {
      try {
        const details = await fetchJson(
          `/higher-education-institutions/${institution.id ?? institution._id}`,
        );
        return [institution.id ?? institution._id, normalizeStudyLocations(details)];
      } catch (error) {
        console.warn(
          `Location data unavailable for institution ${institution.id ?? institution._id}: ${error.message}`,
        );
        return [institution.id ?? institution._id, institution.study_locations ?? []];
      } finally {
        completedCount += 1;
        if (
          completedCount % 25 === 0
          || completedCount === institutions.length
        ) {
          console.log(
            `Fetched location data for ${completedCount}/${institutions.length} institutions`,
          );
        }
      }
    },
  );

  return new Map(entries);
}

function normalizeProgrammeStudyLocations(programme) {
  return [...new Set(
    (programme.carriedOutBy ?? [])
      .filter((performer) => performer.active !== false)
      .map((performer) => performer.implementingAddress?.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, "sl"));
}

async function fetchProgrammeStudyLocations(programmes) {
  let completedCount = 0;
  const entries = await mapWithConcurrency(
    programmes,
    PROGRAMME_FETCH_CONCURRENCY,
    async (programme) => {
      const programmeId = programme.id ?? programme._id;
      try {
        const details = await fetchJson(`/study-programmes/${programmeId}`);
        return [programmeId, normalizeProgrammeStudyLocations(details)];
      } catch (error) {
        console.warn(
          `Location data unavailable for study programme ${programmeId}: ${error.message}`,
        );
        return [programmeId, programme.study_locations ?? []];
      } finally {
        completedCount += 1;
        if (
          completedCount % 100 === 0
          || completedCount === programmes.length
        ) {
          console.log(
            `Fetched location data for ${completedCount}/${programmes.length} study programmes`,
          );
        }
      }
    },
  );

  return new Map(entries);
}

function normalizeInstitution(
  institution,
  hierarchyById,
  parentUniversityById,
  programmesByInstitutionId,
  studyLocationsByInstitutionId,
) {
  const hierarchyRecord = hierarchyById.get(institution._id);
  const programmeIds = programmesByInstitutionId.get(institution._id) ?? [];
  const validProgrammeIds = programmeIds.filter((programme) => programme.valid);

  return {
    id: institution._id,
    evs_code: nullable(institution.sifra),
    name: institution.naziv,
    name_en: nullable(institution.naziv_ang),
    abbreviation: nullable(institution.kratica),
    institution_type: nullable(institution.vrsta),
    legal_form: nullable(institution.oblika),
    website: nullable(hierarchyRecord?.spletni_naslov),
    parent_university_id: nullable(parentUniversityById.get(institution._id)),
    accreditation: {
      accredited_at: nullable(institution.datum_akreditacije),
      decision_number: nullable(institution.st_akreditacijske_odlocbe),
      valid_until: nullable(institution.konec_veljavnosti),
    },
    valid: institution.veljavnost === true,
    study_programme_ids: programmeIds.map((programme) => programme.id),
    study_programme_count: programmeIds.length,
    valid_study_programme_count: validProgrammeIds.length,
    study_locations: studyLocationsByInstitutionId.get(institution._id) ?? [],
  };
}

function normalizeProgramme(
  programme,
  institutionId,
  universityId,
  studyLocationsByProgrammeId,
) {
  const type = programmeTypes[programme.vrsta] ?? programmeTypes[0];
  const cycle = programmeCycles[programme.stopnja] ?? null;

  return {
    id: programme._id,
    evs_code: nullable(programme.sifra),
    name: programme.ime,
    name_en: nullable(programme.ime_ang),
    institution_id: institutionId,
    university_id: nullable(universityId),
    study_locations: studyLocationsByProgrammeId.get(programme._id) ?? [],
    type: {
      code: programme.vrsta,
      name: type.name,
      name_en: type.name_en,
      short_name: type.short_name,
    },
    cycle: cycle
      ? {
          code: programme.stopnja,
          number: cycle.number,
          name: cycle.name,
          name_en: cycle.name_en,
        }
      : null,
    duration_years: nullable(programme.trajanje),
    flags: {
      double_major: programme.dvopred === true,
      pedagogical: programme.pedagoski === true,
      interdisciplinary: programme.interdisc === true,
    },
    professional_title: {
      male: nullable(programme.strok_naslov_m),
      female: nullable(programme.strok_naslov_z),
      abbreviated: nullable(programme.strok_naslov_okr),
    },
    accreditation: {
      decision_date: nullable(programme.datum_sklepa_akr),
      valid_from: nullable(programme.datum_zacetka_akr),
      decision_number: nullable(programme.stevilka_odlocbe_akr),
    },
    self_accreditation: {
      senate_decision_date: nullable(programme.samo_akr_datum_sklepa_senata),
      senate_decision_number: nullable(
        programme.samo_akr_stevilka_sklepa_senata,
      ),
      notification_date: nullable(programme.samo_akr_datum_obvestila),
    },
    valid: programme.veljavnost === true,
    public_notes: nullable(programme.javne_opombe),
  };
}

async function main() {
  if (LOCATIONS_ONLY) {
    const registry = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    const [studyLocationsByInstitutionId, studyLocationsByProgrammeId] =
      await Promise.all([
        fetchInstitutionStudyLocations(registry.institutions),
        fetchProgrammeStudyLocations(registry.study_programmes),
      ]);
    registry.institutions = registry.institutions.map((institution) => ({
      ...institution,
      study_locations: studyLocationsByInstitutionId.get(institution.id) ?? [],
    }));
    registry.study_programmes = registry.study_programmes.map((programme) => ({
      ...programme,
      study_locations: studyLocationsByProgrammeId.get(programme.id) ?? [],
    }));
    registry.metadata.study_locations_generated_at = new Date().toISOString();
    await writeFile(OUTPUT_PATH, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    console.log(`Updated institution study locations in ${OUTPUT_PATH}`);
    return;
  }

  const [rawInstitutions, rawProgrammes, hierarchy] = await Promise.all([
    fetchAllPages("higher-education-institutions", "naziv"),
    fetchAllPages("study-programmes", "ime"),
    fetchJson("/higher-education-institutions/hierarchical"),
  ]);

  const institutionByPair = new Map(
    rawInstitutions.map((institution) => [
      `${institution.naziv}\u0000${institution.kratica ?? ""}`,
      institution,
    ]),
  );
  const institutionByName = new Map(
    rawInstitutions.map((institution) => [institution.naziv, institution]),
  );
  const { records: hierarchyRecords, parentUniversityById } =
    flattenHierarchy(hierarchy);
  const hierarchyById = new Map(
    hierarchyRecords.map((institution) => [institution._id, institution]),
  );

  const studyLocationsByProgrammeId = await fetchProgrammeStudyLocations(
    rawProgrammes,
  );
  const normalizedProgrammes = rawProgrammes.map((programme) => {
    const institution = institutionByPair.get(
      `${programme.zavod_naziv}\u0000${programme.zavod_kratica ?? ""}`,
    );
    if (!institution) {
      throw new Error(
        `Programme ${programme._id} cannot be linked to an institution`,
      );
    }
    const university = programme.univerza_naziv
      ? institutionByName.get(programme.univerza_naziv)
      : null;

    return normalizeProgramme(
      programme,
      institution._id,
      university?._id,
      studyLocationsByProgrammeId,
    );
  });

  const programmesByInstitutionId = normalizedProgrammes.reduce(
    (groups, programme) => {
      const group = groups.get(programme.institution_id) ?? [];
      group.push(programme);
      groups.set(programme.institution_id, group);
      return groups;
    },
    new Map(),
  );

  const studyLocationsByInstitutionId = await fetchInstitutionStudyLocations(
    rawInstitutions,
  );

  const institutions = rawInstitutions.map((institution) =>
    normalizeInstitution(
      institution,
      hierarchyById,
      parentUniversityById,
      programmesByInstitutionId,
      studyLocationsByInstitutionId,
    ),
  );

  const generatedAt = new Date().toISOString();
  const programmeTeacherRecords = await fetchProgrammeTeacherRecords(
    normalizedProgrammes,
  );
  const availableTeacherRecords = programmeTeacherRecords.filter(
    (record) => record.available,
  );
  const unavailableProgrammeIds = programmeTeacherRecords
    .filter((record) => !record.available)
    .map((record) => record.programme_id);

  const output = {
    metadata: {
      title: "Visokošolski zavodi in študijski programi v Sloveniji",
      description:
        "Normaliziran celoten javni register NAKVIS. Vključeni so veljavni in neveljavni zapisi; za aktualni prikaz filtriraj po valid=true.",
      generated_at: generatedAt,
      study_locations_generated_at: generatedAt,
      language: "sl",
      country: "SI",
      scope: {
        includes:
          "Akreditirani visokošolski zavodi in študijski programi iz javnih evidenc NAKVIS, vključno z zgodovinskimi oziroma neveljavnimi zapisi.",
        excludes:
          "Višje strokovne šole, tuji priglašeni programi in podatki o aktualno razpisanih vpisnih mestih.",
      },
      sources: [
        {
          name: "Portal NAKVIS – javne evidence",
          url: PORTAL_URL,
          api_url: API_BASE_URL,
          publisher:
            "Nacionalna agencija Republike Slovenije za kakovost v visokem šolstvu (NAKVIS)",
        },
        {
          name: "OPSI – Šifrant študijskih programov",
          url: "https://podatki.gov.si/dataset/sifrant-studijskih-programov",
          publisher:
            "Ministrstvo za visoko šolstvo, znanost in inovacije",
        },
      ],
      license: {
        name: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        url: "https://creativecommons.org/licenses/by/4.0/",
        attribution:
          "Šifrant študijskih programov, Ministrstvo za visoko šolstvo, znanost in inovacije; javne evidence NAKVIS.",
      },
      counts: {
        institutions: institutions.length,
        valid_institutions: institutions.filter((item) => item.valid).length,
        invalid_institutions: institutions.filter((item) => !item.valid).length,
        study_programmes: normalizedProgrammes.length,
        valid_study_programmes: normalizedProgrammes.filter(
          (item) => item.valid,
        ).length,
        invalid_study_programmes: normalizedProgrammes.filter(
          (item) => !item.valid,
        ).length,
      },
      distributions: {
        institutions_by_type: countBy(
          institutions,
          (item) => item.institution_type,
        ),
        institutions_by_legal_form: countBy(
          institutions,
          (item) => item.legal_form,
        ),
        study_programmes_by_cycle: countBy(
          normalizedProgrammes,
          (item) => item.cycle?.code,
        ),
        study_programmes_by_type_code: countBy(
          normalizedProgrammes,
          (item) => item.type.code,
        ),
      },
    },
    codebooks: {
      programme_types: Object.entries(programmeTypes).map(([code, value]) => ({
        code: Number(code),
        ...value,
      })),
      programme_cycles: Object.entries(programmeCycles).map(([code, value]) => ({
        code,
        ...value,
      })),
    },
    institutions,
    study_programmes: normalizedProgrammes,
  };

  const teachersOutput = {
    metadata: {
      title: "Učitelji in predmeti po študijskih programih v Sloveniji",
      description:
        "Javni podatki NAKVIS o nosilcih in izvajalcih predmetov. Programi, za katere API ne ponuja podatkov, imajo available=false.",
      generated_at: generatedAt,
      language: "sl",
      country: "SI",
      source: {
        name: "Portal NAKVIS – učitelji študijskega programa",
        url: PORTAL_URL,
        api_url: `${API_BASE_URL}/study-programmes/{programme_id}/teachers`,
        publisher:
          "Nacionalna agencija Republike Slovenije za kakovost v visokem šolstvu (NAKVIS)",
      },
      counts: {
        study_programmes: programmeTeacherRecords.length,
        programmes_with_available_data: availableTeacherRecords.length,
        programmes_with_teachers: availableTeacherRecords.filter(
          (record) => record.teachers.length > 0,
        ).length,
        programmes_without_teachers: availableTeacherRecords.filter(
          (record) => record.teachers.length === 0,
        ).length,
        unavailable_programmes: unavailableProgrammeIds.length,
        teacher_records: availableTeacherRecords.reduce(
          (sum, record) => sum + record.teachers.length,
          0,
        ),
        course_assignments: availableTeacherRecords.reduce(
          (sum, record) =>
            sum +
            record.teachers.reduce(
              (teacherSum, teacher) => teacherSum + teacher.courses.length,
              0,
            ),
          0,
        ),
      },
      unavailable_programme_ids: unavailableProgrammeIds,
    },
    programmes: Object.fromEntries(
      programmeTeacherRecords.map((record) => [record.programme_id, record]),
    ),
  };
  const performerSearchOutput = createPerformerSearchRegistry(teachersOutput);

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await mkdir(dirname(TEACHERS_OUTPUT_PATH), { recursive: true });
  await mkdir(dirname(PERFORMER_SEARCH_OUTPUT_PATH), { recursive: true });
  await Promise.all([
    writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8"),
    writeFile(
      TEACHERS_OUTPUT_PATH,
      `${JSON.stringify(teachersOutput, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      PERFORMER_SEARCH_OUTPUT_PATH,
      `${JSON.stringify(performerSearchOutput)}\n`,
      "utf8",
    ),
  ]);
  console.log(
    `Wrote ${institutions.length} institutions and ${normalizedProgrammes.length} study programmes to ${OUTPUT_PATH}`,
  );
  console.log(
    `Wrote ${teachersOutput.metadata.counts.teacher_records} teacher records and ${teachersOutput.metadata.counts.course_assignments} course assignments to ${TEACHERS_OUTPUT_PATH}`,
  );
  console.log(
    `Wrote performer search data for ${performerSearchOutput.metadata.programmes_with_data} study programmes to ${PERFORMER_SEARCH_OUTPUT_PATH}`,
  );
}

await main();
