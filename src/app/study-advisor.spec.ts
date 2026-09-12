import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProgrammePerformerSearchRegistry, Registry } from './models';
import {
  ADVISOR_RECOMMENDATION_LIMIT,
  type AdvisorAnswers,
  advisorQuestions,
  buildUserTraits,
  institutionMatchesLocation,
  normalizeAdvisorAnswers,
  paginateAdvisorRecommendations,
  programmeMatchesLocation,
  recommendStudyProgrammes,
  toggleAdvisorAnswerSelection,
} from './study-advisor';

const PRIMARY_RECOMMENDATION_SAMPLE_SIZE = 10;

interface AdvisorScenario {
  name: string;
  answers: AdvisorAnswers;
  expectedProgramme: RegExp;
  expectedProgrammeLabel: string;
  expectedWithin: number;
  expectedArea: string;
  minimumAreaMatches: number;
  expectedInstitution?: RegExp;
  expectedInstitutionWithin?: number;
}

const registry = readJson<Registry>('data/slovenia-higher-education.json');
const performerRegistry = readJson<ProgrammePerformerSearchRegistry>(
  'data/programme-performer-search.json',
);

const scenarios: AdvisorScenario[] = [
  {
    name: 'računalništvo',
    answers: answersByLabels({
      challenge: 'Razviti aplikacijo ali pametno napravo',
      subjects: 'Matematika, fizika ali računalništvo',
      focus: 'S podatki in sistemi',
      outcome: 'Nekaj, kar dejansko deluje',
      mathematics: 'Zelo mi ustreza',
      learning: 'S praktičnim preizkušanjem',
      environment: 'Računalnik, razvojna ekipa ali tehnološko podjetje',
      purpose: 'Razvijati nove tehnologije in rešitve',
      location: 'Lokacija mi ni pomembna',
    }),
    expectedProgramme: /^(Računalništvo in informatika|Računalništvo in informacijske tehnologije)$/,
    expectedProgrammeLabel: 'računalniški ali informacijski program',
    expectedWithin: 5,
    expectedArea: 'Računalništvo in tehnika',
    minimumAreaMatches: 8,
  },
  {
    name: 'pravo',
    answers: answersByLabels({
      challenge: 'Razumeti, zakaj se ljudje in družba vedejo tako, kot se',
      subjects: 'Ekonomija, sociologija ali pravo',
      focus: 'Z besedami in vsebinami',
      outcome: 'Jasna razlaga zahtevnega problema',
      mathematics: 'Raje bi je imel manj',
      learning: 'S pogovorom in sodelovanjem',
      environment: 'Podjetje, ustanova ali projektna ekipa',
      purpose: 'Bolje razumeti svet, naravo ali družbo',
      location: 'Lokacija mi ni pomembna',
    }),
    expectedProgramme: /^Pravo$/,
    expectedProgrammeLabel: 'program Pravo',
    expectedWithin: 10,
    expectedArea: 'Družba in pravo',
    minimumAreaMatches: 8,
  },
  {
    name: 'medicina',
    answers: answersByLabels({
      challenge: 'Pomagati človeku pri zdravstveni težavi',
      subjects: 'Biologija ali kemija',
      focus: 'Z ljudmi',
      outcome: 'Pozitiven vpliv na človeka',
      mathematics: 'V redu je, če ima jasen namen',
      learning: 'Z mešanico teorije in prakse',
      environment: 'Šola, klinika ali svetovalno okolje',
      purpose: 'Pomagati ljudem pri zdravju ali razvoju',
      location: 'Lokacija mi ni pomembna',
    }),
    expectedProgramme: /^(Medicina|Splošna medicina)$/,
    expectedProgrammeLabel: 'program Medicina ali Splošna medicina',
    expectedWithin: 10,
    expectedArea: 'Zdravstvo in medicina',
    minimumAreaMatches: 8,
  },
  {
    name: 'arhitektura',
    answers: answersByLabels({
      challenge: [
        'Ustvariti vizualno, glasbeno ali filmsko delo',
        'Razviti aplikacijo ali pametno napravo',
      ],
      subjects: [
        'Likovna, glasbena ali druga umetnost',
        'Matematika, fizika ali računalništvo',
      ],
      focus: [
        'Z napravami, materiali ali prostori',
        'Z idejami in raziskovalnimi vprašanji',
      ],
      outcome: 'Nekaj, kar dejansko deluje',
      mathematics: 'V redu je, če ima jasen namen',
      learning: 'Z mešanico teorije in prakse',
      environment: [
        'Studio, oder ali ustvarjalna delavnica',
        'Računalnik, razvojna ekipa ali tehnološko podjetje',
      ],
      purpose: 'Razvijati nove tehnologije in rešitve',
      location: 'Lokacija mi ni pomembna',
    }),
    expectedProgramme: /^Arhitektura$/,
    expectedProgrammeLabel: 'program Arhitektura',
    expectedWithin: 3,
    expectedArea: 'Umetnost in oblikovanje',
    minimumAreaMatches: 5,
  },
  {
    name: 'ekonomija',
    answers: answersByLabels({
      challenge: 'Organizirati projekt ali podjetje',
      subjects: 'Ekonomija, sociologija ali pravo',
      focus: 'S podatki in sistemi',
      outcome: 'Uspešno izveden načrt',
      mathematics: 'V redu je, če ima jasen namen',
      learning: 'Z mešanico teorije in prakse',
      environment: 'Podjetje, ustanova ali projektna ekipa',
      purpose: 'Voditi projekte in ustvarjati priložnosti',
      location: 'Lokacija mi ni pomembna',
    }),
    expectedProgramme: /Ekonom|Poslov/,
    expectedProgrammeLabel: 'ekonomski ali poslovni program',
    expectedWithin: 5,
    expectedArea: 'Poslovanje in ekonomija',
    minimumAreaMatches: 8,
  },
  {
    name: 'glasba',
    answers: answersByLabels({
      challenge: 'Ustvariti vizualno, glasbeno ali filmsko delo',
      subjects: 'Likovna, glasbena ali druga umetnost',
      focus: 'Z ljudmi',
      outcome: 'Izvirna ideja ali izraz',
      mathematics: 'Raje bi je imel manj',
      learning: 'S praktičnim preizkušanjem',
      environment: 'Studio, oder ali ustvarjalna delavnica',
      purpose: 'Povezovati ljudi, jezike in ideje',
      location: 'Lokacija mi ni pomembna',
    }),
    expectedProgramme: /^Glasbena umetnost$/,
    expectedProgrammeLabel: 'program Glasbena umetnost',
    expectedWithin: 3,
    expectedArea: 'Umetnost in oblikovanje',
    minimumAreaMatches: 8,
  },
  {
    name: 'šport in kineziologija',
    answers: answersByLabels({
      challenge: 'Pomagati človeku pri zdravstveni težavi',
      subjects: 'Šport ali praktični pouk',
      focus: 'Z naravo ali živimi sistemi',
      outcome: 'Nekaj, kar dejansko deluje',
      mathematics: 'V redu je, če ima jasen namen',
      learning: 'S praktičnim preizkušanjem',
      environment: 'Šola, klinika ali svetovalno okolje',
      purpose: 'Pomagati ljudem pri zdravju ali razvoju',
      location: 'Lokacija mi ni pomembna',
    }),
    expectedProgramme: /^(Kineziologija|Športno treniranje)$/,
    expectedProgrammeLabel: 'program Kineziologija ali Športno treniranje',
    expectedWithin: 3,
    expectedArea: 'Šport in gibanje',
    minimumAreaMatches: 5,
    expectedInstitution: /^Fakulteta za šport$/,
    expectedInstitutionWithin: 3,
  },
  {
    name: 'jeziki in prevajanje',
    answers: answersByLabels({
      challenge: 'Ustvariti vizualno, glasbeno ali filmsko delo',
      subjects: 'Jeziki, zgodovina ali filozofija',
      focus: 'Z besedami in vsebinami',
      outcome: 'Jasna razlaga zahtevnega problema',
      mathematics: 'Raje bi je imel manj',
      learning: 'S poglobljenim razumevanjem teorije',
      environment: 'Šola, klinika ali svetovalno okolje',
      purpose: 'Povezovati ljudi, jezike in ideje',
      location: 'Lokacija mi ni pomembna',
    }),
    expectedProgramme: /^(Angleški jezik in književnost|Anglistika|Prevajalstvo)$/,
    expectedProgrammeLabel: 'jezikovni ali prevajalski program',
    expectedWithin: 5,
    expectedArea: 'Jeziki in humanistika',
    minimumAreaMatches: 8,
  },
];

describe.each(scenarios)('priporočila za profil: $name', (scenario) => {
  const recommendations = recommendStudyProgrammes(
    registry,
    scenario.answers,
    performerRegistry,
  );
  const names = recommendations.map((recommendation) =>
    recommendation.result.item.name);

  it(`med prvimi ${scenario.expectedWithin} predlaga ${scenario.expectedProgrammeLabel}`, () => {
    const leadingNames = names.slice(0, scenario.expectedWithin);
    expect(
      leadingNames.some((name) => scenario.expectedProgramme.test(name)),
      `Dejanski vrstni red: ${names.join(' | ')}`,
    ).toBe(true);
  });

  it(`med prvimi ${PRIMARY_RECOMMENDATION_SAMPLE_SIZE} doseže zahtevano zastopanost področja »${scenario.expectedArea}«`, () => {
    const leadingRecommendations = recommendations.slice(
      0,
      PRIMARY_RECOMMENDATION_SAMPLE_SIZE,
    );
    const areaMatches = leadingRecommendations.filter((recommendation) =>
      recommendation.areas.includes(scenario.expectedArea));

    expect(areaMatches.length).toBeGreaterThanOrEqual(scenario.minimumAreaMatches);
  });

  it('pri vsaj enem priporočilu navede ujemajoče predmete', () => {
    expect(recommendations.some((recommendation) =>
      recommendation.matchingCourses.length > 0)).toBe(true);
  });

  if (scenario.expectedInstitution) {
    it(`med prvimi ${scenario.expectedInstitutionWithin} vključuje pričakovano fakulteto`, () => {
      const leadingRecommendations = recommendations.slice(
        0,
        scenario.expectedInstitutionWithin,
      );
      expect(leadingRecommendations.some((recommendation) =>
        scenario.expectedInstitution?.test(
          recommendation.result.institution?.name ?? '',
        ))).toBe(true);
    });
  }
});

describe('obseg in strani priporočil', () => {
  const recommendations = recommendStudyProgrammes(
    registry,
    scenarios[0].answers,
    performerRegistry,
  );

  it('privzeto vrne največ 50 najbolje ocenjenih programov', () => {
    expect(recommendations).toHaveLength(ADVISOR_RECOMMENDATION_LIMIT);
    expect(ADVISOR_RECOMMENDATION_LIMIT).toBe(50);
  });

  it('rezultate razdeli na strani po 10 brez prekrivanja', () => {
    const firstPage = paginateAdvisorRecommendations(recommendations, 0, 10);
    const secondPage = paginateAdvisorRecommendations(recommendations, 1, 10);
    const lastPage = paginateAdvisorRecommendations(recommendations, 4, 10);
    const pageAfterLast = paginateAdvisorRecommendations(recommendations, 5, 10);

    expect(firstPage).toHaveLength(10);
    expect(secondPage).toHaveLength(10);
    expect(lastPage).toHaveLength(10);
    expect(pageAfterLast).toHaveLength(0);
    expect(secondPage[0]).toBe(recommendations[10]);
    expect(new Set([...firstPage, ...secondPage]).size).toBe(20);
  });
});

describe('fuzzy ujemanje predmetov v priporočilih', () => {
  it('prepozna manjšo tipkarsko napako v imenu predmeta', () => {
    const syntheticRegistry = registryWithSingleProgramme();
    const syntheticPerformers: ProgrammePerformerSearchRegistry = {
      metadata: {
        generated_at: '2026-01-01T00:00:00.000Z',
        programmes_with_data: 1,
        teacher_records: 1,
        course_assignments: 1,
      },
      programmes: {
        test: [['Testni učitelj', null, [['Marketimg', null, null]]]],
      },
    };
    const answers = answersByLabels({
      challenge: 'Organizirati projekt ali podjetje',
      subjects: 'Ekonomija, sociologija ali pravo',
      focus: 'S podatki in sistemi',
      outcome: 'Uspešno izveden načrt',
      mathematics: 'V redu je, če ima jasen namen',
      learning: 'Z mešanico teorije in prakse',
      environment: 'Podjetje, ustanova ali projektna ekipa',
      purpose: 'Voditi projekte in ustvarjati priložnosti',
      location: 'Lokacija mi ni pomembna',
    });

    const [recommendation] = recommendStudyProgrammes(
      syntheticRegistry,
      answers,
      syntheticPerformers,
    );

    expect(recommendation?.matchingCourses).toContain('Marketimg');
    expect(recommendation?.areas).toContain('Poslovanje in ekonomija');
  });
});

describe('več odgovorov pri posameznem vprašanju', () => {
  it('sprejme stare enojne odgovore in jih pretvori v sezname', () => {
    expect(normalizeAdvisorAnswers({
      challenge: 'build-app',
      mathematics: 'math-ok',
    })).toEqual({
      challenge: ['build-app'],
      mathematics: ['math-ok'],
    });
  });

  it('odstrani podvojene in neveljavne izbire ter upošteva omejitve', () => {
    expect(normalizeAdvisorAnswers({
      challenge: ['build-app', 'create-work', 'help-person'],
      subjects: ['math-physics', 'math-physics', 'neveljavno'],
      mathematics: ['math-love', 'math-little'],
      location: ['location-central', 'location-anywhere', 'location-gorenjska'],
    })).toEqual({
      challenge: ['build-app', 'create-work'],
      subjects: ['math-physics'],
      mathematics: ['math-love'],
      location: ['location-anywhere'],
    });
  });

  it('izbrane možnosti istega vprašanja povpreči in jih ne sešteje', () => {
    expect(buildUserTraits({
      challenge: ['build-app', 'create-work'],
    })).toEqual({
      technology: 2,
      analytical: 1.5,
      practical: 1,
      arts: 2,
      creative: 2,
    });
  });

  it('izključujočo lokacijsko možnost zamenja z območjem in obratno', () => {
    const locationQuestion = advisorQuestions.find((question) =>
      question.id === 'location');
    if (!locationQuestion) throw new Error('Lokacijsko vprašanje manjka.');

    expect(toggleAdvisorAnswerSelection(
      locationQuestion,
      ['location-anywhere'],
      'location-central',
    )).toEqual(['location-central']);
    expect(toggleAdvisorAnswerSelection(
      locationQuestion,
      ['location-central', 'location-goriska'],
      'location-anywhere',
    )).toEqual(['location-anywhere']);
  });
});

describe('izvajalci priporočenega programa', () => {
  it('rezultatu doda fakulteto in pripadajočo univerzo', () => {
    const syntheticRegistry = registryWithSingleProgramme();
    syntheticRegistry.institutions[0].parent_university_id = 'university';
    syntheticRegistry.institutions.push({
      ...syntheticRegistry.institutions[0],
      id: 'university',
      name: 'Testna univerza',
      parent_university_id: null,
    });
    syntheticRegistry.study_programmes[0].university_id = 'university';

    const [recommendation] = recommendStudyProgrammes(syntheticRegistry, {
      challenge: ['build-app'],
    });

    expect(recommendation?.result.institution?.name).toBe('Testni zavod');
    expect(recommendation?.result.university?.name).toBe('Testna univerza');
  });
});

describe('lokacijske preference', () => {
  const singleLocationScenarios = [
    {
      optionId: 'location-central',
      area: 'Ljubljana in osrednja Slovenija',
      representativeLocations: ['1000 Ljubljana', 'Domžale', 'Trbovlje'],
      outsideLocation: 'Maribor',
    },
    {
      optionId: 'location-northeast',
      area: 'Maribor in severovzhodna Slovenija',
      representativeLocations: ['Maribor', 'Ptuj', 'Murska Sobota'],
      outsideLocation: 'Ljubljana',
    },
    {
      optionId: 'location-savinjska-koroska',
      area: 'Savinjska in Koroška',
      representativeLocations: ['Celje', 'Velenje', 'Slovenj Gradec'],
      outsideLocation: 'Kranj',
    },
    {
      optionId: 'location-gorenjska',
      area: 'Gorenjska',
      representativeLocations: ['Kranj', 'Bled', 'Škofja Loka'],
      outsideLocation: 'Koper',
    },
    {
      optionId: 'location-coast-karst',
      area: 'Obala in Kras',
      representativeLocations: ['Koper', 'Portorož', 'Sežana'],
      outsideLocation: 'Nova Gorica',
    },
    {
      optionId: 'location-goriska',
      area: 'Goriška',
      representativeLocations: ['Nova Gorica', 'Ajdovščina', 'Šempeter pri Gorici'],
      outsideLocation: 'Novo mesto',
    },
    {
      optionId: 'location-southeast-posavje',
      area: 'Dolenjska in Posavje',
      representativeLocations: ['Novo mesto', 'Krško', 'Brežice'],
      outsideLocation: 'Celje',
    },
  ];

  it('možnost brez lokacijske preference ne spremeni rezultatov', () => {
    const { location: _location, ...answersWithoutLocation } = scenarios[0].answers;
    const withoutLocation = recommendStudyProgrammes(
      registry,
      answersWithoutLocation,
      performerRegistry,
    );
    const locationAnywhere = recommendStudyProgrammes(
      registry,
      scenarios[0].answers,
      performerRegistry,
    );

    expect(locationAnywhere.map((recommendation) => [
      recommendation.result.item.id,
      recommendation.matchPercent,
    ])).toEqual(withoutLocation.map((recommendation) => [
      recommendation.result.item.id,
      recommendation.matchPercent,
    ]));
  });

  it('izloči sicer enakovreden program zunaj izbranega območja', () => {
    const syntheticRegistry = registryWithSingleProgramme();
    syntheticRegistry.institutions[0].study_locations = ['2000 Maribor'];
    syntheticRegistry.study_programmes[0].name = 'A testni program';
    syntheticRegistry.study_programmes[0].study_locations = ['2000 Maribor'];
    syntheticRegistry.institutions.push({
      ...syntheticRegistry.institutions[0],
      id: 'central-institution',
      name: 'Z testni zavod',
      study_locations: ['1000 Ljubljana'],
    });
    syntheticRegistry.study_programmes.push({
      ...syntheticRegistry.study_programmes[0],
      id: 'central-programme',
      name: 'Z testni program',
      institution_id: 'central-institution',
      study_locations: ['1000 Ljubljana'],
    });

    const recommendations = recommendStudyProgrammes(syntheticRegistry, {
      challenge: ['build-app'],
      location: ['location-central'],
    }, undefined, 2);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.result.item.id).toBe('central-programme');
    expect(recommendations[0]?.reasons[0]).toContain('območij');
  });

  it('uporabi kraj izvajanja programa in ne vseh krajev njegove fakultete', () => {
    const programme = registry.study_programmes.find((candidate) =>
      candidate.id === '601294465f658a74ae513eb0');
    const institution = registry.institutions.find((candidate) =>
      candidate.id === programme?.institution_id);

    expect(programme?.name).toBe('Upravljanje z okoljem');
    expect(institution?.name).toBe('Fakulteta za poslovne in upravne vede');
    expect(institutionMatchesLocation(institution, 'location-central')).toBe(true);
    expect(programme).toBeDefined();
    expect(programmeMatchesLocation(
      programme!,
      institution,
      'location-central',
    )).toBe(false);
    expect(programmeMatchesLocation(
      programme!,
      institution,
      'location-southeast-posavje',
    )).toBe(true);

    const centralRecommendations = recommendStudyProgrammes(registry, {
      location: ['location-central'],
    }, performerRegistry);
    expect(centralRecommendations.some((recommendation) =>
      recommendation.result.item.id === programme?.id)).toBe(false);
  });

  describe.each(singleLocationScenarios)('$area', (scenario) => {
    it('pravilno prepozna kraje območja in zavrne kraj iz drugega območja', () => {
      for (const studyLocation of scenario.representativeLocations) {
        expect(programmeMatchesLocation({
          ...registry.study_programmes[0],
          study_locations: [studyLocation],
        }, registry.institutions[0], scenario.optionId), studyLocation).toBe(true);
      }

      expect(programmeMatchesLocation({
        ...registry.study_programmes[0],
        study_locations: [scenario.outsideLocation],
      }, registry.institutions[0], scenario.optionId)).toBe(false);
    });

    it('pri izključno tej lokacijski izbiri vrne programe z izbranega območja', () => {
      const recommendations = recommendStudyProgrammes(registry, {
        location: [scenario.optionId],
      }, performerRegistry, 10);

      expect(recommendations).toHaveLength(10);
      for (const recommendation of recommendations) {
        expect(
          programmeMatchesLocation(
            recommendation.result.item,
            recommendation.result.institution,
            scenario.optionId,
          ),
          `${recommendation.result.item.name} — ${recommendation.result.institution?.name}`,
        ).toBe(true);
        expect(recommendation.reasons[0]).toContain('območij');
      }
    });

    it('pri polnem profilu vrne samo programe z izbranega območja', () => {
      const { location: _location, ...answersWithoutLocation } = scenarios[0].answers;
      const withLocation = recommendStudyProgrammes(registry, {
        ...answersWithoutLocation,
        location: [scenario.optionId],
      }, performerRegistry);
      const locationMatches = withLocation.filter((recommendation) =>
        programmeMatchesLocation(
          recommendation.result.item,
          recommendation.result.institution,
          scenario.optionId,
        ));

      expect(withLocation.length).toBeGreaterThan(0);
      expect(locationMatches).toHaveLength(withLocation.length);
    });
  });
});

function answersByLabels(
  labels: Record<string, string | string[]>,
): AdvisorAnswers {
  return Object.fromEntries(Object.entries(labels).map(([questionId, label]) => {
    const question = advisorQuestions.find((candidate) => candidate.id === questionId);
    const selectedLabels = Array.isArray(label) ? label : [label];
    const optionIds = selectedLabels.map((selectedLabel) =>
      question?.options.find((candidate) => candidate.label === selectedLabel)?.id);
    if (!question || optionIds.some((optionId) => !optionId)) {
      throw new Error(`Neveljaven testni odgovor: ${questionId} = ${selectedLabels.join(', ')}`);
    }
    return [questionId, optionIds as string[]];
  }));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T;
}

function registryWithSingleProgramme(): Registry {
  return {
    metadata: {
      generated_at: '2026-01-01T00:00:00.000Z',
      counts: { valid_institutions: 1, valid_study_programmes: 1 },
    },
    institutions: [{
      id: 'institution',
      evs_code: null,
      name: 'Testni zavod',
      name_en: null,
      abbreviation: null,
      institution_type: 'Testni zavod',
      legal_form: 'Testna oblika',
      website: null,
      parent_university_id: null,
      study_locations: [],
      valid: true,
      study_programme_count: 1,
      valid_study_programme_count: 1,
    }],
    study_programmes: [{
      id: 'test',
      evs_code: null,
      name: 'Splošni interdisciplinarni program',
      name_en: null,
      institution_id: 'institution',
      university_id: null,
      study_locations: [],
      type: { code: 1, name: 'Univerzitetni', short_name: 'UN' },
      cycle: { code: 'I.', number: 1, name: 'Prva stopnja' },
      duration_years: 3,
      professional_title: { male: null, female: null, abbreviated: null },
      valid: true,
    }],
  };
}
