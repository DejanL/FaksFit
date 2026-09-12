import type {
  Institution,
  ProgrammePerformerSearchRegistry,
  ProgrammePerformerSearchTeacher,
  Registry,
  SearchResult,
  StudyProgramme,
} from './models';
import { normalizeSearchText, tokenMatchKind } from './programme-search';

export type AdvisorTrait =
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

export type TraitScores = Partial<Record<AdvisorTrait, number>>;

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
  allowMultiple?: boolean;
  maxSelections?: number;
  exclusiveOptionIds?: string[];
}

export type AdvisorAnswers = Record<string, string[]>;

export interface AdvisorRecommendation {
  result: SearchResult;
  matchPercent: number;
  areas: string[];
  reasons: string[];
  matchingCourses: string[];
}

interface ProgrammeProfile {
  traits: TraitScores;
  areas: string[];
}

interface CourseEvidence {
  name: string;
  traits: TraitScores;
}

type CourseTokenIndex = Map<string, string[]>;

interface CourseProfile extends ProgrammeProfile {
  evidence: CourseEvidence[];
}

interface AreaRule {
  label: string;
  keywords: string[];
  traits: TraitScores;
}

export const ADVISOR_RECOMMENDATION_LIMIT = 50;
const MAX_RECOMMENDATIONS_PER_INSTITUTION = 3;
const COURSE_PROFILE_WEIGHT = 0.3;
const LOCATION_QUESTION_ID = 'location';
const LOCATION_ANYWHERE_OPTION_ID = 'location-anywhere';
const courseProfileCache = new WeakMap<
  ProgrammePerformerSearchRegistry,
  Map<string, CourseProfile>
>();

const locationRules: Array<{ optionId: string; keywords: string[] }> = [
  {
    optionId: 'location-central',
    keywords: ['ljubljana', 'domzale', 'trzin', 'logatec', 'trbovlje', 'grosuplje', 'vrhnika', 'godovic'],
  },
  {
    optionId: 'location-northeast',
    keywords: ['maribor', 'hoce', 'ptuj', 'murska sobota', 'slovenska bistrica', 'lendava', 'ljutomer', 'radenci', 'rakican'],
  },
  {
    optionId: 'location-savinjska-koroska',
    keywords: ['celje', 'velenje', 'rogaska slatina', 'slovenj gradec', 'slovenske konjice', 'ravne na koroskem', 'zalec'],
  },
  {
    optionId: 'location-gorenjska',
    keywords: ['kranj', 'bled', 'jesenice', 'trzic', 'radovljica', 'skofja loka'],
  },
  {
    optionId: 'location-coast-karst',
    keywords: ['koper', 'izola', 'portoroz', 'piran', 'sezana', 'dutovlje', 'postojna'],
  },
  {
    optionId: 'location-goriska',
    keywords: ['nova gorica', 'sempeter pri gorici', 'sempeter pri novi gorici', 'ajdovscina', 'vipava'],
  },
  {
    optionId: 'location-southeast-posavje',
    keywords: ['novo mesto', 'krsko', 'brezice', 'crnomelj', 'trebnje', 'kocevje'],
  },
];

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

const courseAreaRules: AreaRule[] = [
  {
    label: 'Računalništvo in tehnika',
    keywords: ['programir', 'algorit', 'racunal', 'informat', 'podatkovne baz', 'umetna inteligenca', 'strojno ucenje', 'kibernet', 'programsk', 'spletn', 'operacijski sistem', 'omrez', 'elektron', 'elektrotehn', 'avtomat', 'robot', 'mehatron', 'mehanik', 'termodinam', 'konstrukc', 'gradben', 'geodez', 'energet', 'telekomunik', 'material'],
    traits: { technology: 5, mathematics: 3, analytical: 4, practical: 3, creative: 1 },
  },
  {
    label: 'Matematika in analitika',
    keywords: ['matemat', 'statist', 'verjetnost', 'optimiz', 'analiza podat', 'modelir', 'numeric'],
    traits: { mathematics: 5, analytical: 5, research: 2, technology: 1 },
  },
  {
    label: 'Zdravstvo in medicina',
    keywords: ['anatom', 'fiziolog', 'patolog', 'zdravst', 'klinic', 'medicin', 'farmakolog', 'fizioterap', 'zdravstvena nega', 'dental', 'rehabilitac'],
    traits: { health: 5, social: 3, practical: 4, research: 2, nature: 1 },
  },
  {
    label: 'Naravoslovje in okolje',
    keywords: ['biolog', 'kemij', 'fizik', 'ekolog', 'okolj', 'genet', 'mikrobiolog', 'biokem', 'botan', 'zoolog', 'agronom', 'gozdar', 'laborator'],
    traits: { nature: 5, research: 4, analytical: 3, practical: 2 },
  },
  {
    label: 'Poslovanje in ekonomija',
    keywords: ['ekonom', 'financ', 'racunovod', 'marketing', 'trzenj', 'management', 'menedzment', 'podjet', 'organizacij', 'logistik', 'poslov'],
    traits: { business: 5, analytical: 2, social: 2, practical: 3 },
  },
  {
    label: 'Družba in pravo',
    keywords: ['psiholog', 'sociolog', 'pravo', 'pravn', 'polit', 'druzb', 'komunik', 'medij', 'socialno delo', 'uprav', 'varnost', 'kriminal', 'antropolog', 'mednarodni odnosi'],
    traits: { society: 5, social: 3, analytical: 2, research: 2, languages: 1 },
  },
  {
    label: 'Izobraževanje',
    keywords: ['didakt', 'pedagog', 'poucev', 'izobrazev', 'vzgoj', 'metodik', 'ucitelj'],
    traits: { education: 5, social: 5, practical: 3, creative: 2 },
  },
  {
    label: 'Umetnost in oblikovanje',
    keywords: ['oblikov', 'risanj', 'slikanj', 'glasb', 'film', 'gledal', 'ples', 'fotograf', 'arhitektur', 'vizual', 'kipar'],
    traits: { arts: 5, creative: 5, practical: 2, lowMath: 2 },
  },
  {
    label: 'Jeziki in humanistika',
    keywords: ['anglesc', 'nemsc', 'slovensc', 'jezik', 'knjizev', 'prevaj', 'zgodovin', 'filozof', 'kultur', 'humanist', 'teolog', 'arheolog'],
    traits: { languages: 5, society: 2, research: 3, creative: 2, lowMath: 3 },
  },
  {
    label: 'Šport in gibanje',
    keywords: ['sport', 'kineziolog', 'vadb', 'trening', 'gibal'],
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

const preparedCourseAreaRules = courseAreaRules.map((rule) => ({
  rule,
  keywordTokens: rule.keywords.map((keyword) => advisorTokens([keyword])),
}));

export const advisorQuestions: AdvisorQuestion[] = [
  {
    id: 'challenge',
    title: 'Katere naloge se ti zdijo najbolj zanimive?',
    description: 'Izberi največ dve, ki bi ju najraje preizkusil, tudi če z njima še nimaš izkušenj.',
    allowMultiple: true,
    maxSelections: 2,
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
    description: 'Izberi največ tri skupine. Pomembno je zanimanje, ne ocena.',
    allowMultiple: true,
    maxSelections: 3,
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
    description: 'Izberi največ dve vrsti dela, pri katerih bi se dobro počutil.',
    allowMultiple: true,
    maxSelections: 2,
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
    title: 'Katera delovna okolja si najlažje predstavljaš?',
    description: 'Izberi največ dve. To ni dokončna odločitev, ampak le namig o tvojem načinu dela.',
    allowMultiple: true,
    maxSelections: 2,
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
  {
    id: LOCATION_QUESTION_ID,
    title: 'Kje v Sloveniji bi najraje študiral?',
    description: 'Izberi največ tri območja, na katerih želiš študirati. Prikazali bomo le programe, ki se tam izvajajo.',
    allowMultiple: true,
    maxSelections: 3,
    exclusiveOptionIds: [LOCATION_ANYWHERE_OPTION_ID],
    options: [
      option('location-central', 'Ljubljana in osrednja Slovenija', 'Ljubljana z bližnjo okolico.', '◎', {}),
      option('location-northeast', 'Maribor in severovzhodna Slovenija', 'Maribor, Ptuj, Murska Sobota in okolica.', '↗', {}),
      option('location-savinjska-koroska', 'Savinjska in Koroška', 'Celje, Velenje, Rogaška Slatina, Slovenj Gradec in okolica.', '◇', {}),
      option('location-gorenjska', 'Gorenjska', 'Kranj, Bled, Jesenice in okolica.', '△', {}),
      option('location-coast-karst', 'Obala in Kras', 'Koper, Izola, Portorož, Sežana in okolica.', '≈', {}),
      option('location-goriska', 'Goriška', 'Nova Gorica, Ajdovščina, Vipava in okolica.', '◁', {}),
      option('location-southeast-posavje', 'Dolenjska in Posavje', 'Novo mesto, Krško, Brežice in okolica.', '▽', {}),
      option(LOCATION_ANYWHERE_OPTION_ID, 'Lokacija mi ni pomembna', 'Pri razvrščanju naj ima prednost vsebinsko ujemanje.', '○', {}),
    ],
  },
];

export function recommendStudyProgrammes(
  registry: Registry,
  answers: AdvisorAnswers,
  performerRegistry?: ProgrammePerformerSearchRegistry | null,
  limit = ADVISOR_RECOMMENDATION_LIMIT,
): AdvisorRecommendation[] {
  const userTraits = buildUserTraits(answers);
  const preferredLocationIds = selectedPreferredLocationIds(answers);
  const institutions = new Map<string, Institution>(
    registry.institutions.map((institution) => [institution.id, institution]),
  );

  const ranked = registry.study_programmes
    .filter((programme) =>
      programme.valid
      && (programme.cycle.code === 'I.' || programme.type.short_name === 'EMAG')
      && (
        preferredLocationIds.length === 0
        || preferredLocationIds.some((locationId) =>
          programmeMatchesLocation(
            programme,
            institutions.get(programme.institution_id),
            locationId,
          ))
      )
    )
    .map((programme) => {
      const institution = institutions.get(programme.institution_id);
      const university = programme.university_id
        ? institutions.get(programme.university_id)
        : undefined;
      const profile = buildProgrammeProfile(programme, institution, university);
      const courseProfile = performerRegistry
        ? getCourseProfile(performerRegistry, programme.id)
        : emptyCourseProfile();
      const hasCourseProfile = courseProfile.evidence.length > 0;
      const programmeSimilarity = cosineSimilarity(userTraits, profile.traits);
      const courseSimilarity = hasCourseProfile
        ? cosineSimilarity(userTraits, courseProfile.traits)
        : 0;
      const similarity = hasCourseProfile
        ? programmeSimilarity * (1 - COURSE_PROFILE_WEIGHT)
          + courseSimilarity * COURSE_PROFILE_WEIGHT
        : programmeSimilarity;
      const locationMatch = preferredLocationIds.length > 0
        && preferredLocationIds.some((locationId) =>
          programmeMatchesLocation(programme, institution, locationId));
      const recommendationTraits = hasCourseProfile
        ? blendTraitProfiles(
          profile.traits,
          courseProfile.traits,
          COURSE_PROFILE_WEIGHT,
        )
        : profile.traits;
      const traitReasons = bestReasons(userTraits, recommendationTraits);
      const reasons = locationMatch
        ? ['izvaja se na enem od območij, kjer želiš študirati', ...traitReasons]
          .slice(0, 3)
        : traitReasons;
      const programmeAreas = profile.areas.filter((area) =>
        area !== 'Interdisciplinarno področje');
      const areas = [...new Set([
        ...programmeAreas,
        ...courseProfile.areas,
      ])];

      return {
        result: { item: programme, institution, university },
        matchPercent: Math.round(similarity * 100),
        areas: (areas.length > 0 ? areas : profile.areas).slice(0, 2),
        reasons,
        matchingCourses: bestMatchingCourses(userTraits, courseProfile.evidence),
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

export function paginateAdvisorRecommendations(
  recommendations: AdvisorRecommendation[],
  pageIndex: number,
  pageSize: number,
): AdvisorRecommendation[] {
  const normalizedPageSize = Math.max(1, Math.floor(pageSize));
  const normalizedPageIndex = Math.max(0, Math.floor(pageIndex));
  const start = normalizedPageIndex * normalizedPageSize;
  return recommendations.slice(start, start + normalizedPageSize);
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

export function normalizeAdvisorAnswers(answers: unknown): AdvisorAnswers {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {};

  const normalized: AdvisorAnswers = {};
  const answerRecord = answers as Record<string, unknown>;

  for (const question of advisorQuestions) {
    const rawAnswer = answerRecord[question.id];
    const candidates = Array.isArray(rawAnswer)
      ? rawAnswer
      : typeof rawAnswer === 'string'
        ? [rawAnswer]
        : [];
    const validOptionIds = new Set(question.options.map((option) => option.id));
    const selectionLimit = question.allowMultiple
      ? Math.max(1, question.maxSelections ?? question.options.length)
      : 1;
    const uniqueValidSelections = [...new Set(
      candidates.filter((candidate): candidate is string =>
        typeof candidate === 'string' && validOptionIds.has(candidate)),
    )];
    const exclusiveSelection = uniqueValidSelections.find((candidate) =>
      question.exclusiveOptionIds?.includes(candidate));
    const validSelections = exclusiveSelection
      ? [exclusiveSelection]
      : uniqueValidSelections.slice(0, selectionLimit);

    if (validSelections.length > 0) normalized[question.id] = validSelections;
  }

  return normalized;
}

export function toggleAdvisorAnswerSelection(
  question: AdvisorQuestion,
  currentSelections: string[],
  optionId: string,
): string[] {
  if (!question.options.some((option) => option.id === optionId)) {
    return currentSelections;
  }
  if (!question.allowMultiple) return [optionId];

  const isSelected = currentSelections.includes(optionId);
  if (isSelected) {
    return currentSelections.filter((selection) => selection !== optionId);
  }

  const exclusiveOptionIds = question.exclusiveOptionIds ?? [];
  if (exclusiveOptionIds.includes(optionId)) return [optionId];

  const currentNonExclusiveSelections = currentSelections.filter((selection) =>
    !exclusiveOptionIds.includes(selection));
  const maxSelections = question.maxSelections ?? question.options.length;
  return currentNonExclusiveSelections.length < maxSelections
    ? [...currentNonExclusiveSelections, optionId]
    : currentSelections;
}

export function buildUserTraits(answers: AdvisorAnswers): TraitScores {
  const scores: TraitScores = {};
  const normalizedAnswers = normalizeAdvisorAnswers(answers);

  for (const question of advisorQuestions) {
    const selectedOptions = question.options.filter((candidate) =>
      normalizedAnswers[question.id]?.includes(candidate.id));
    if (selectedOptions.length === 0) continue;

    const optionWeight = 1 / selectedOptions.length;
    for (const selectedOption of selectedOptions) {
      addTraits(scores, selectedOption.traits, optionWeight);
    }
  }

  return scores;
}

export function institutionMatchesLocation(
  institution: Institution | undefined,
  locationOptionId: string,
): boolean {
  const rule = locationRules.find((candidate) =>
    candidate.optionId === locationOptionId);
  if (!institution || !rule) return false;

  return [...(institution.study_locations ?? []), institution.name].some((location) => {
    const normalizedLocation = normalizeSearchText(location);
    return rule.keywords.some((keyword) => normalizedLocation.includes(keyword));
  });
}

export function programmeMatchesLocation(
  programme: StudyProgramme,
  institution: Institution | undefined,
  locationOptionId: string,
): boolean {
  const rule = locationRules.find((candidate) =>
    candidate.optionId === locationOptionId);
  if (!rule) return false;

  if (Array.isArray(programme.study_locations)) {
    return programme.study_locations.some((location) => {
      const normalizedLocation = normalizeSearchText(location);
      return rule.keywords.some((keyword) => normalizedLocation.includes(keyword));
    });
  }

  return institutionMatchesLocation(institution, locationOptionId);
}

function selectedPreferredLocationIds(answers: AdvisorAnswers): string[] {
  const selections = normalizeAdvisorAnswers(answers)[LOCATION_QUESTION_ID] ?? [];
  return selections.filter((selection) => selection !== LOCATION_ANYWHERE_OPTION_ID);
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

function getCourseProfile(
  registry: ProgrammePerformerSearchRegistry,
  programmeId: string,
): CourseProfile {
  let registryCache = courseProfileCache.get(registry);
  if (!registryCache) {
    registryCache = new Map<string, CourseProfile>();
    courseProfileCache.set(registry, registryCache);
  }

  const cached = registryCache.get(programmeId);
  if (cached) return cached;

  const profile = buildCourseProfile(registry.programmes[programmeId] ?? []);
  registryCache.set(programmeId, profile);
  return profile;
}

function buildCourseProfile(
  teachers: ProgrammePerformerSearchTeacher[],
): CourseProfile {
  const uniqueCourses = new Map<
    string,
    { name: string; tokenIndex: CourseTokenIndex }
  >();

  for (const [, , courses] of teachers) {
    for (const [name, nameEn] of courses) {
      const key = normalizeSearchText(name);
      if (key && !uniqueCourses.has(key)) {
        uniqueCourses.set(key, {
          name,
          tokenIndex: indexCourseTokens(courseClassificationTokens(name, nameEn)),
        });
      }
    }
  }

  const traits: TraitScores = {};
  const evidence: CourseEvidence[] = [];
  const areaCounts = new Map<string, number>();

  for (const course of uniqueCourses.values()) {
    const courseTraits: TraitScores = {};

    for (const { rule, keywordTokens } of preparedCourseAreaRules) {
      if (!keywordTokens.some((keyword) =>
        courseMatchesKeyword(course.tokenIndex, keyword))) {
        continue;
      }
      addTraits(courseTraits, rule.traits);
      areaCounts.set(rule.label, (areaCounts.get(rule.label) ?? 0) + 1);
    }

    if (!hasTraits(courseTraits)) continue;
    addTraits(traits, courseTraits);
    evidence.push({ name: course.name, traits: courseTraits });
  }

  const areas = [...areaCounts.entries()]
    .sort((left, right) =>
      right[1] - left[1]
      || left[0].localeCompare(right[0], 'sl'))
    .map(([area]) => area);

  return { traits, areas, evidence };
}

function advisorTokens(values: Array<string | null>): string[] {
  return [...new Set(normalizeSearchText(values.filter(Boolean).join(' '))
    .split(/\s+/)
    .filter((token) => token.length >= 2 || /^\d+$/.test(token)))];
}

function courseClassificationTokens(name: string, nameEn: string | null): string[] {
  return advisorTokens([name, nameEn].map((value) => {
    const normalized = normalizeSearchText(value ?? '');
    return normalized.split(/\b(?:za|for)\b/, 1)[0] ?? normalized;
  }));
}

function indexCourseTokens(tokens: string[]): CourseTokenIndex {
  const index: CourseTokenIndex = new Map();

  for (const token of tokens) {
    const initial = token[0];
    if (!initial) continue;
    const candidates = index.get(initial) ?? [];
    candidates.push(token);
    index.set(initial, candidates);
  }

  return index;
}

function courseMatchesKeyword(
  courseTokenIndex: CourseTokenIndex,
  keywordTokens: string[],
): boolean {
  return keywordTokens.length > 0 && keywordTokens.every((keywordToken) =>
    (courseTokenIndex.get(keywordToken[0] ?? '') ?? []).some((courseToken) =>
      tokenMatchKind(keywordToken, courseToken) !== null));
}

function emptyCourseProfile(): CourseProfile {
  return { traits: {}, areas: [], evidence: [] };
}

function hasTraits(scores: TraitScores): boolean {
  return Object.values(scores).some((score) => (score ?? 0) > 0);
}

function blendTraitProfiles(
  programmeTraits: TraitScores,
  courseTraits: TraitScores,
  courseWeight: number,
): TraitScores {
  const blended: TraitScores = {};
  const programmeLength = traitVectorLength(programmeTraits);
  const courseLength = traitVectorLength(courseTraits);

  for (const trait of Object.keys(reasonByTrait) as AdvisorTrait[]) {
    const programmeScore = programmeLength
      ? (programmeTraits[trait] ?? 0) / programmeLength
      : 0;
    const courseScore = courseLength
      ? (courseTraits[trait] ?? 0) / courseLength
      : 0;
    blended[trait] = programmeScore * (1 - courseWeight)
      + courseScore * courseWeight;
  }

  return blended;
}

function traitVectorLength(scores: TraitScores): number {
  return Math.sqrt((Object.keys(reasonByTrait) as AdvisorTrait[]).reduce(
    (total, trait) => total + (scores[trait] ?? 0) ** 2,
    0,
  ));
}

function bestMatchingCourses(
  userTraits: TraitScores,
  evidence: CourseEvidence[],
): string[] {
  return evidence
    .map((course) => ({
      name: course.name,
      contribution: traitContribution(userTraits, course.traits),
    }))
    .filter((course) => course.contribution > 0)
    .sort((left, right) =>
      right.contribution - left.contribution
      || left.name.localeCompare(right.name, 'sl'))
    .slice(0, 3)
    .map((course) => course.name);
}

function traitContribution(left: TraitScores, right: TraitScores): number {
  return (Object.keys(reasonByTrait) as AdvisorTrait[]).reduce(
    (total, trait) => total + (left[trait] ?? 0) * (right[trait] ?? 0),
    0,
  );
}

function addTraits(
  target: TraitScores,
  additions: TraitScores,
  weight = 1,
): void {
  for (const trait of Object.keys(additions) as AdvisorTrait[]) {
    target[trait] = (target[trait] ?? 0) + (additions[trait] ?? 0) * weight;
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
