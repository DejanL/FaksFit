import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProgrammePerformerSearchRegistry, Registry } from './models';
import {
  type AdvisorAnswers,
  advisorQuestions,
  buildUserTraits,
  normalizeAdvisorAnswers,
  recommendStudyProgrammes,
} from './study-advisor';

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

  it(`večino priporočil uvrsti v področje »${scenario.expectedArea}«`, () => {
    const areaMatches = recommendations.filter((recommendation) =>
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
    })).toEqual({
      challenge: ['build-app', 'create-work'],
      subjects: ['math-physics'],
      mathematics: ['math-love'],
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
      type: { code: 1, name: 'Univerzitetni', short_name: 'UN' },
      cycle: { code: 'I.', number: 1, name: 'Prva stopnja' },
      duration_years: 3,
      professional_title: { male: null, female: null, abbreviated: null },
      valid: true,
    }],
  };
}
