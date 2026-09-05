import type { Institution, Registry, SearchResult, StudyProgramme } from './models';
import { normalizeSearchText } from './programme-search';

type AdvisorTrait =
  | 'technology'
  | 'mathematics'
  | 'nature'
  | 'health'
  | 'business'
  | 'society'
  | 'education'
  | 'arts'
  | 'languages'
  | 'analytical'
  | 'practical'
  | 'social'
  | 'creative'
  | 'research'
  | 'lowMath';

type TraitScores = Partial<Record<AdvisorTrait, number>>;

export interface AdvisorOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  traits: TraitScores;
}

export interface AdvisorQuestion {
  id: string;
  title: string;
  description: string;
  options: AdvisorOption[];
}

export interface AdvisorRecommendation {
  result: SearchResult;
  matchPercent: number;
  areas: string[];
  reasons: string[];
}

interface ProgrammeProfile {
  traits: TraitScores;
  areas: string[];
}

interface AreaRule {
  label: string;
  keywords: string[];
  traits: TraitScores;
}

const DEFAULT_RECOMMENDATION_LIMIT = 12;
const MAX_RECOMMENDATIONS_PER_INSTITUTION = 3;

const reasonByTrait: Record<AdvisorTrait, string> = {
  technology: 'zanimata te tehnologija in digitalni svet',
  mathematics: 'ustreza ti delo z matematiko in številkami',
  nature: 'privlačita te narava in okolje',
  health: 'zanima te zdravje in dobrobit ljudi',
  business: 'zanimajo te poslovanje, organizacija in podjetništvo',
  society: 'želiš razumeti družbo in njeno delovanje',
  education: 'veselita te razlaganje in izobraževanje',
  arts: 'blizu so ti umetnost, oblikovanje in izražanje',
  languages: 'veselijo te jeziki, besedila in kulture',
  analytical: 'rad rešuješ zahtevne in logične probleme',
  practical: 'ustreza ti praktično in projektno delo',
  social: 'pomembno ti je delo z ljudmi',
  creative: 'želiš ustvarjati nove ideje in rešitve',
  research: 'privlačita te raziskovanje in poglobljeno razumevanje',
  lowMath: 'raje izbiraš področja z manj poudarka na matematiki',
};

const areaRules: AreaRule[] = [
  {
    label: 'Računalništvo in tehnika',
    keywords: ['racunal', 'informat', 'programir', 'elektrotehn', 'strojni', 'mehatron', 'inzenir', 'gradben', 'geodez', 'telekomunik', 'energet', 'robot', 'materiali', 'promet'],
    traits: { technology: 5, mathematics: 4, analytical: 5, practical: 3, creative: 2 },
  },
  {
    label: 'Zdravstvo in medicina',
    keywords: ['medicin', 'zdravst', 'farmacij', 'fizioterap', 'dental', 'veterin', 'babist', 'radiolo', 'sanitar', 'delovna terap', 'psihoterap'],
    traits: { health: 5, nature: 2, social: 4, practical: 4, research: 2 },
  },
  {
    label: 'Naravoslovje in okolje',
    keywords: ['biolog', 'kemij', 'fizik', 'matemat', 'geolog', 'naravoslov', 'ekolog', 'okolj', 'gozdar', 'agronom', 'kmetij', 'zivil', 'mikrobiolog', 'biotehnolog'],
    traits: { nature: 5, research: 4, analytical: 4, mathematics: 2, practical: 2 },
  },
  {
    label: 'Poslovanje in ekonomija',
    keywords: ['ekonom', 'poslov', 'management', 'menedzment', 'financ', 'racunovod', 'marketing', 'podjetnist', 'turiz', 'organizacij', 'logistik', 'trzenje'],
    traits: { business: 5, analytical: 2, social: 2, practical: 3 },
  },
  {
    label: 'Družba in pravo',
    keywords: ['sociolog', 'psiholog', 'socialno delo', 'politolog', 'druzboslov', 'komunikolog', 'novinar', 'medij', 'antropolog', 'kulturolog', 'pravo', 'javna uprava', 'uprav', 'varnost', 'kriminalist', 'mednarodni odnosi'],
    traits: { society: 5, social: 3, analytical: 3, research: 2, languages: 1 },
  },
  {
    label: 'Izobraževanje',
    keywords: ['pedagog', 'ucitelj', 'poucevan', 'izobrazevan', 'vzgoj', 'andragog', 'razredni pouk', 'specialna in rehabilitacijska'],
    traits: { education: 5, social: 5, practical: 3, creative: 2 },
  },
  {
    label: 'Umetnost in oblikovanje',
    keywords: ['umetn', 'oblikovan', 'glasb', 'film', 'gledal', 'ples', 'fotograf', 'arhitektur', 'slikar', 'kipar', 'vizualn'],
    traits: { arts: 5, creative: 5, practical: 2, lowMath: 2 },
  },
  {
    label: 'Jeziki in humanistika',
    keywords: ['jezik', 'knjizev', 'zgodovin', 'filozof', 'prevaj', 'anglist', 'slavist', 'germanist', 'romanist', 'humanist', 'teolog', 'arheolog', 'bibliotekar'],
    traits: { languages: 5, society: 2, research: 3, creative: 2, lowMath: 3 },
  },
  {
    label: 'Šport in gibanje',
    keywords: ['sport', 'kineziolog', 'trener'],
    traits: { health: 2, practical: 5, social: 3, nature: 1 },
  },
];

const specializationRules: Array<{ keywords: string[]; traits: TraitScores }> = [
  {
    keywords: ['racunal', 'informat', 'programir', 'podatkovne tehnolog', 'kibernets'],
    traits: { technology: 4, analytical: 3, mathematics: 1, creative: 1 },
  },
  {
    keywords: ['elektrotehn', 'strojni', 'mehatron', 'gradben', 'geodez', 'inzenir', 'energet'],
    traits: { technology: 2, practical: 4, mathematics: 3, analytical: 2 },
  },
  {
    keywords: ['medicin', 'zdravst', 'fizioterap', 'dental', 'babist', 'delovna terap'],
    traits: { health: 4, social: 3, practical: 3, research: 1 },
  },
  {
    keywords: ['biolog', 'kemij', 'fizik', 'mikrobiolog', 'biotehnolog', 'farmacij'],
    traits: { nature: 3, research: 4, analytical: 2 },
  },
  {
    keywords: ['pedagog', 'ucitelj', 'poucevan', 'vzgoj', 'razredni pouk'],
    traits: { education: 4, social: 4, practical: 2 },
  },
  {
    keywords: ['oblikovan', 'film', 'gledal', 'glasb', 'slikar', 'kipar', 'vizualn'],
    traits: { arts: 4, creative: 5, practical: 1 },
  },
];

export const advisorQuestions: AdvisorQuestion[] = [
  {
    id: 'challenge',
    title: 'Katera naloga se ti zdi najbolj zanimiva?',
    description: 'Izberi tisto, ki bi jo najraje preizkusil, tudi če z njo še nimaš izkušenj.',
    options: [
      option('build-app', 'Razviti aplikacijo ali pametno napravo', 'Tehnologija, logika in ustvarjanje rešitev.', '⌘', { technology: 4, analytical: 3, practical: 1 }),
      option('help-person', 'Pomagati človeku pri zdravstveni težavi', 'Zdravje, stik z ljudmi in odgovornost.', '♥', { health: 4, social: 3, practical: 2 }),
      option('explore-nature', 'Raziskati pojav v naravi', 'Opazovanje, poskusi in odkrivanje zakonitosti.', '⌁', { nature: 4, research: 3, analytical: 2 }),
      option('organize-project', 'Organizirati projekt ali podjetje', 'Načrtovanje, odločanje in sodelovanje.', '↗', { business: 4, practical: 2, social: 1 }),
      option('create-work', 'Ustvariti vizualno, glasbeno ali filmsko delo', 'Izražanje idej skozi ustvarjalnost.', '✦', { arts: 4, creative: 4, practical: 1 }),
      option('understand-society', 'Razumeti, zakaj se ljudje in družba vedejo tako, kot se', 'Družbeni pojavi, odnosi in raziskovanje.', '◎', { society: 4, social: 2, research: 2 }),
    ],
  },
  {
    id: 'subjects',
    title: 'Kateri šolski predmeti so ti najbližje?',
    description: 'Ni treba, da imaš pri njih najboljšo oceno — pomembno je zanimanje.',
    options: [
      option('math-physics', 'Matematika, fizika ali računalništvo', 'Uživam v logičnih nalogah in sistemih.', '∑', { mathematics: 4, technology: 3, analytical: 3 }),
      option('bio-chemistry', 'Biologija ali kemija', 'Zanimajo me živi sistemi, snovi in poskusi.', '⚗', { nature: 4, health: 2, research: 2 }),
      option('languages-history', 'Jeziki, zgodovina ali filozofija', 'Veselijo me besedila, kulture in ideje.', 'A', { languages: 4, society: 2, research: 2, lowMath: 1 }),
      option('economics-society', 'Ekonomija, sociologija ali pravo', 'Zanima me delovanje organizacij in družbe.', '◫', { business: 3, society: 3, analytical: 1 }),
      option('arts', 'Likovna, glasbena ali druga umetnost', 'Najraje se izražam in ustvarjam.', '✎', { arts: 4, creative: 4, lowMath: 2 }),
      option('sport-practice', 'Šport ali praktični pouk', 'Najbolje se učim skozi gibanje in delo.', '●', { practical: 4, health: 2, social: 1 }),
    ],
  },
  {
    id: 'focus',
    title: 'S čim bi najraje delal večino dneva?',
    description: 'Pomislil na okolje, v katerem bi se dobro počutil.',
    options: [
      option('data', 'S podatki in sistemi', 'Analiziranje, načrtovanje in iskanje vzorcev.', '▦', { analytical: 4, technology: 2, mathematics: 2 }),
      option('people', 'Z ljudmi', 'Pogovor, pomoč, svetovanje ali poučevanje.', '◉', { social: 4, education: 2, health: 1 }),
      option('nature', 'Z naravo ali živimi sistemi', 'Terensko, laboratorijsko ali okoljsko delo.', '♧', { nature: 4, research: 2, practical: 2 }),
      option('objects', 'Z napravami, materiali ali prostori', 'Načrtovanje, izdelava in izboljševanje.', '◇', { technology: 3, practical: 4, creative: 1 }),
      option('words', 'Z besedami in vsebinami', 'Pisanje, jeziki, mediji ali kulture.', '¶', { languages: 4, creative: 2, society: 1 }),
      option('ideas', 'Z idejami in raziskovalnimi vprašanji', 'Poglobljeno razmišljanje in odkrivanje.', '?', { research: 4, analytical: 3, creative: 1 }),
    ],
  },
  {
    id: 'outcome',
    title: 'Kakšen rezultat dela te najbolj motivira?',
    description: 'Izberi rezultat, ob katerem bi imel najboljši občutek.',
    options: [
      option('working-product', 'Nekaj, kar dejansko deluje', 'Izdelek, program, naprava ali zgrajen prostor.', '▣', { practical: 4, technology: 2 }),
      option('clear-explanation', 'Jasna razlaga zahtevnega problema', 'Razumevanje in logično utemeljevanje.', '≡', { analytical: 4, research: 2 }),
      option('new-expression', 'Izvirna ideja ali izraz', 'Nekaj novega, drugačnega in osebnega.', '✦', { creative: 4, arts: 2 }),
      option('positive-impact', 'Pozitiven vpliv na človeka', 'Pomoč, napredek ali boljše počutje.', '♥', { social: 4, health: 2, education: 2 }),
      option('successful-organization', 'Uspešno izveden načrt', 'Dober rezultat ekipe, projekta ali organizacije.', '✓', { business: 4, practical: 2, social: 1 }),
    ],
  },
  {
    id: 'mathematics',
    title: 'Kako se počutiš ob matematiki?',
    description: 'Odgovori iskreno — nobena možnost ni boljša od druge.',
    options: [
      option('math-love', 'Zelo mi ustreza', 'Rad rešujem zahtevnejše matematične probleme.', '+', { mathematics: 5, analytical: 2 }),
      option('math-ok', 'V redu je, če ima jasen namen', 'Matematiko sprejmem kot orodje pri študiju.', '≈', { mathematics: 2, practical: 2 }),
      option('math-little', 'Raje bi je imel manj', 'Bolj me veselijo drugačni načini razmišljanja.', '−', { lowMath: 5, languages: 1, social: 1, creative: 1 }),
    ],
  },
  {
    id: 'learning',
    title: 'Kako se najraje učiš?',
    description: 'Pomislil na način, pri katerem si najbolj zavzet.',
    options: [
      option('theory', 'S poglobljenim razumevanjem teorije', 'Rad raziskujem, zakaj nekaj velja.', '∞', { research: 4, analytical: 3 }),
      option('practice', 'S praktičnim preizkušanjem', 'Največ odnesem iz vaj, projektov in dela.', '⚒', { practical: 5 }),
      option('discussion', 'S pogovorom in sodelovanjem', 'Pomagajo mi različni pogledi in stik z ljudmi.', '◌', { social: 4, education: 1, society: 1 }),
      option('creation', 'Z ustvarjanjem lastnih rešitev', 'Rad imam odprte naloge brez enega odgovora.', '✧', { creative: 4, practical: 2 }),
      option('balanced', 'Z mešanico teorije in prakse', 'Najprej želim razumeti, potem pa preizkusiti.', '◐', { research: 2, analytical: 2, practical: 3 }),
    ],
  },
  {
    id: 'environment',
    title: 'Katero delovno okolje si najlažje predstavljaš?',
    description: 'To ni dokončna odločitev, ampak le namig o tvojem načinu dela.',
    options: [
      option('computer', 'Računalnik, razvojna ekipa ali tehnološko podjetje', 'Digitalni izdelki, sistemi in reševanje problemov.', '⌨', { technology: 5, analytical: 2 }),
      option('lab-field', 'Laboratorij ali delo na terenu', 'Meritve, poskusi, narava in raziskovanje.', '⌁', { nature: 4, research: 3, practical: 2 }),
      option('school-clinic', 'Šola, klinika ali svetovalno okolje', 'Neposreden stik, pomoč in razvoj ljudi.', '⌂', { social: 4, education: 3, health: 2 }),
      option('studio', 'Studio, oder ali ustvarjalna delavnica', 'Oblikovanje, izvedba in izražanje.', '✦', { arts: 4, creative: 4, practical: 1 }),
      option('organization', 'Podjetje, ustanova ali projektna ekipa', 'Sodelovanje, organizacija in odločanje.', '▤', { business: 4, social: 2, practical: 2 }),
    ],
  },
  {
    id: 'purpose',
    title: 'Kaj želiš s svojim znanjem predvsem doseči?',
    description: 'Izberi smer, ki te trenutno najbolj nagovarja.',
    options: [
      option('innovate', 'Razvijati nove tehnologije in rešitve', 'Izboljševati način, kako stvari delujejo.', '↗', { technology: 4, creative: 2, analytical: 2 }),
      option('help', 'Pomagati ljudem pri zdravju ali razvoju', 'Delo z neposrednim pozitivnim vplivom.', '♥', { health: 3, education: 2, social: 4 }),
      option('understand', 'Bolje razumeti svet, naravo ali družbo', 'Raziskovati vprašanja in širiti znanje.', '◎', { research: 4, nature: 2, society: 2 }),
      option('communicate', 'Povezovati ljudi, jezike in ideje', 'Sporazumevanje, vsebine in različne kulture.', 'A', { languages: 4, social: 2, creative: 2 }),
      option('lead', 'Voditi projekte in ustvarjati priložnosti', 'Organiziranje, poslovne odločitve in pobude.', '◆', { business: 4, practical: 2, social: 2 }),
      option('create', 'Ustvarjati kulturo, podobe ali izkušnje', 'Izraziti ideje na svoj način.', '✦', { arts: 4, creative: 4 }),
    ],
  },
];

export function recommendStudyProgrammes(
  registry: Registry,
  answers: Record<string, string>,
  limit = DEFAULT_RECOMMENDATION_LIMIT,
): AdvisorRecommendation[] {
  const userTraits = buildUserTraits(answers);
  const institutions = new Map<string, Institution>(
    registry.institutions.map((institution) => [institution.id, institution]),
  );

  const ranked = registry.study_programmes
    .filter((programme) =>
      programme.valid
      && (programme.cycle.code === 'I.' || programme.type.short_name === 'EMAG'),
    )
    .map((programme) => {
      const institution = institutions.get(programme.institution_id);
      const university = programme.university_id
        ? institutions.get(programme.university_id)
        : undefined;
      const profile = buildProgrammeProfile(programme, institution, university);
      const similarity = cosineSimilarity(userTraits, profile.traits);
      const reasons = bestReasons(userTraits, profile.traits);

      return {
        result: { item: programme, institution, university },
        matchPercent: Math.round(similarity * 100),
        areas: profile.areas.slice(0, 2),
        reasons,
      } satisfies AdvisorRecommendation;
    })
    .sort((a, b) =>
      b.matchPercent - a.matchPercent
      || a.result.item.name.localeCompare(b.result.item.name, 'sl'),
    );

  const recommendations: AdvisorRecommendation[] = [];
  const seenNames = new Set<string>();
  const institutionCounts = new Map<string, number>();

  for (const recommendation of ranked) {
    const nameKey = normalizeSearchText(recommendation.result.item.name);
    const institutionKey = recommendation.result.item.institution_id;
    if (seenNames.has(nameKey)) continue;
    if (
      (institutionCounts.get(institutionKey) ?? 0)
      >= MAX_RECOMMENDATIONS_PER_INSTITUTION
    ) continue;

    recommendations.push(recommendation);
    seenNames.add(nameKey);
    institutionCounts.set(institutionKey, (institutionCounts.get(institutionKey) ?? 0) + 1);
    if (recommendations.length === limit) break;
  }

  // Če omejitev po zavodih vrne premalo rezultatov, seznam dopolnimo z
  // naslednjimi najbolje ocenjenimi programi, vendar še vedno brez podvojenih imen.
  if (recommendations.length < limit) {
    for (const recommendation of ranked) {
      const nameKey = normalizeSearchText(recommendation.result.item.name);
      if (seenNames.has(nameKey)) continue;

      recommendations.push(recommendation);
      seenNames.add(nameKey);
      if (recommendations.length === limit) break;
    }
  }

  return recommendations;
}

function option(
  id: string,
  label: string,
  description: string,
  icon: string,
  traits: TraitScores,
): AdvisorOption {
  return { id, label, description, icon, traits };
}

function buildUserTraits(answers: Record<string, string>): TraitScores {
  const scores: TraitScores = {};

  for (const question of advisorQuestions) {
    const selectedOption = question.options.find((candidate) =>
      candidate.id === answers[question.id]);
    if (!selectedOption) continue;
    addTraits(scores, selectedOption.traits);
  }

  return scores;
}

function buildProgrammeProfile(
  programme: StudyProgramme,
  institution?: Institution,
  university?: Institution,
): ProgrammeProfile {
  const searchable = normalizeSearchText([
    programme.name,
    programme.name_en,
    programme.professional_title.male,
    programme.professional_title.female,
    institution?.name,
    university?.name,
  ].filter(Boolean).join(' '));
  const traits: TraitScores = {};
  const areas: string[] = [];

  for (const rule of areaRules) {
    if (!rule.keywords.some((keyword) => searchable.includes(keyword))) continue;
    addTraits(traits, rule.traits);
    areas.push(rule.label);
  }

  for (const rule of specializationRules) {
    if (rule.keywords.some((keyword) => searchable.includes(keyword))) {
      addTraits(traits, rule.traits);
    }
  }

  if (areas.length === 0) {
    addTraits(traits, { society: 2, research: 2, analytical: 1, practical: 1 });
    areas.push('Interdisciplinarno področje');
  }

  if (programme.type.short_name === 'VS') addTraits(traits, { practical: 2 });
  if (programme.type.short_name === 'UN') addTraits(traits, { research: 1, analytical: 1 });
  if (programme.type.short_name === 'EMAG') addTraits(traits, { research: 1, practical: 1 });

  return { traits, areas: [...new Set(areas)] };
}

function addTraits(target: TraitScores, additions: TraitScores): void {
  for (const trait of Object.keys(additions) as AdvisorTrait[]) {
    target[trait] = (target[trait] ?? 0) + (additions[trait] ?? 0);
  }
}

function cosineSimilarity(left: TraitScores, right: TraitScores): number {
  const traits = Object.keys(reasonByTrait) as AdvisorTrait[];
  const dotProduct = traits.reduce(
    (total, trait) => total + (left[trait] ?? 0) * (right[trait] ?? 0),
    0,
  );
  const leftLength = Math.sqrt(traits.reduce(
    (total, trait) => total + (left[trait] ?? 0) ** 2,
    0,
  ));
  const rightLength = Math.sqrt(traits.reduce(
    (total, trait) => total + (right[trait] ?? 0) ** 2,
    0,
  ));

  return leftLength && rightLength ? dotProduct / (leftLength * rightLength) : 0;
}

function bestReasons(userTraits: TraitScores, programmeTraits: TraitScores): string[] {
  return (Object.keys(reasonByTrait) as AdvisorTrait[])
    .map((trait) => ({
      trait,
      contribution: (userTraits[trait] ?? 0) * (programmeTraits[trait] ?? 0),
    }))
    .filter((entry) => entry.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((entry) => reasonByTrait[entry.trait]);
}
