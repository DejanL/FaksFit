import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProgrammePerformerSearchRegistry, Registry } from './models';
import {
  advisorQuestions,
  recommendStudyProgrammes,
} from './study-advisor';

interface AdvisorScenario {
  name: string;
  answers: Record<string, string>;
  expectedProgramme: RegExp;
  expectedProgrammeLabel: string;
  expectedWithin: number;
  expectedArea: string;
  minimumAreaMatches: number;
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
      challenge: 'Ustvariti vizualno, glasbeno ali filmsko delo',
      subjects: 'Matematika, fizika ali računalništvo',
      focus: 'Z idejami in raziskovalnimi vprašanji',
      outcome: 'Nekaj, kar dejansko deluje',
      mathematics: 'V redu je, če ima jasen namen',
      learning: 'Z mešanico teorije in prakse',
      environment: 'Studio, oder ali ustvarjalna delavnica',
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

function answersByLabels(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(labels).map(([questionId, label]) => {
    const question = advisorQuestions.find((candidate) => candidate.id === questionId);
    const option = question?.options.find((candidate) => candidate.label === label);
    if (!question || !option) {
      throw new Error(`Neveljaven testni odgovor: ${questionId} = ${label}`);
    }
    return [questionId, option.id];
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
