import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ProgrammePerformerSearchRegistry,
  ProgrammeTeacher,
  ProgrammeTeachersRegistry,
  Registry,
  SearchPerformerMatch,
  SearchResult,
} from './models';
import {
  buildProgrammeSearchIndex,
  matchesTokenizedQuery,
  normalizeSearchText,
  searchProgrammeIndex,
} from './programme-search';
import {
  type AdvisorAnswers,
  type AdvisorQuestion,
  AdvisorRecommendation,
  advisorQuestions,
  normalizeAdvisorAnswers,
  recommendStudyProgrammes,
} from './study-advisor';

const ADVISOR_STORAGE_KEY = 'faksfit.study-advisor.v2';
const LEGACY_ADVISOR_STORAGE_KEY = 'faksfit.study-advisor.v1';

interface StoredAdvisorState {
  version: 2;
  answers: AdvisorAnswers;
  step: number;
  finished: boolean;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  readonly registry = signal<Registry | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly performerSearchRegistry = signal<ProgrammePerformerSearchRegistry | null>(null);
  readonly performerSearchLoading = signal(true);
  readonly performerSearchError = signal(false);
  readonly query = signal('');
  readonly cycle = signal('all');
  readonly institutionId = signal('all');
  readonly memberInstitutionId = signal('all');
  readonly includeInvalid = signal(false);
  readonly resultLimit = 60;
  readonly visibleResultLimit = signal(this.resultLimit);
  readonly teacherPageSize = 20;
  readonly expandedProgrammeId = signal<string | null>(null);
  readonly teachersRegistry = signal<ProgrammeTeachersRegistry | null>(null);
  readonly teachersLoading = signal(false);
  readonly teachersError = signal(false);
  readonly teacherQuery = signal('');
  readonly visibleTeacherLimit = signal(this.teacherPageSize);
  readonly advisorQuestions = advisorQuestions;
  readonly advisorOpen = signal(false);
  readonly advisorStep = signal(0);
  readonly advisorAnswers = signal<AdvisorAnswers>({});
  readonly advisorFinished = signal(false);

  readonly advisorHasProgress = computed(() =>
    Object.keys(this.advisorAnswers()).length > 0,
  );

  readonly currentAdvisorQuestion = computed(() =>
    this.advisorQuestions[this.advisorStep()],
  );

  readonly advisorProgress = computed(() =>
    ((this.advisorStep() + 1) / this.advisorQuestions.length) * 100,
  );

  readonly advisorRecommendations = computed(() => {
    const registry = this.registry();
    return registry && this.advisorFinished()
      ? recommendStudyProgrammes(
        registry,
        this.advisorAnswers(),
        this.performerSearchRegistry(),
      )
      : [];
  });

  readonly hasActiveFilters = computed(() =>
    this.cycle() !== 'all'
    || this.institutionId() !== 'all'
    || this.memberInstitutionId() !== 'all'
    || this.includeInvalid(),
  );

  readonly hasSearchCriteria = computed(() =>
    Boolean(this.query().trim()) || this.hasActiveFilters(),
  );

  private readonly programmeSearchIndex = computed(() => {
    const registry = this.registry();
    return registry
      ? buildProgrammeSearchIndex(registry, this.performerSearchRegistry())
      : [];
  });

  readonly institutionOptions = computed(() => {
    const registry = this.registry();
    if (!registry) return [];

    const providerIds = new Set(
      registry.study_programmes.map((programme) =>
        programme.university_id ?? programme.institution_id,
      ),
    );

    return registry.institutions
      .filter((institution) => providerIds.has(institution.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'sl'));
  });

  readonly memberInstitutionOptions = computed(() => {
    const registry = this.registry();
    const institutionId = this.institutionId();
    if (!registry || institutionId === 'all') return [];

    const providerIds = new Set(
      registry.study_programmes.map((programme) => programme.institution_id),
    );

    return registry.institutions
      .filter((institution) =>
        institution.parent_university_id === institutionId
        && providerIds.has(institution.id),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'sl'));
  });

  readonly results = computed<SearchResult[]>(() => {
    const registry = this.registry();
    if (!registry || !this.hasSearchCriteria()) return [];

    const query = this.query().trim();
    const cycle = this.cycle();
    const institutionId = this.institutionId();
    const memberInstitutionId = this.memberInstitutionId();
    const includeInvalid = this.includeInvalid();
    const documents = this.programmeSearchIndex().filter(({ result }) => {
      const programme = result.item;
      if (!includeInvalid && !programme.valid) return false;
      if (cycle !== 'all' && programme.cycle.code !== cycle) return false;
      if (
        institutionId !== 'all'
        && programme.university_id !== institutionId
        && programme.institution_id !== institutionId
      ) return false;
      if (
        memberInstitutionId !== 'all'
        && programme.institution_id !== memberInstitutionId
      ) return false;
      return true;
    });

    if (query) return searchProgrammeIndex(documents, query);

    return documents
      .map((document) => document.result)
      .sort((a, b) => a.item.name.localeCompare(b.item.name, 'sl'));
  });

  readonly visibleResults = computed(() => {
    const results = this.results();
    return this.query().trim() ? results.slice(0, this.visibleResultLimit()) : results;
  });

  readonly remainingResultCount = computed(() =>
    Math.max(0, this.results().length - this.visibleResults().length),
  );

  readonly activeTeacherRecord = computed(() => {
    const programmeId = this.expandedProgrammeId();
    return programmeId
      ? this.teachersRegistry()?.programmes[programmeId]
      : undefined;
  });

  readonly filteredTeachers = computed(() => {
    const record = this.activeTeacherRecord();
    const query = normalize(this.teacherQuery().trim());
    if (!record?.available) return [];
    if (!query) return record.teachers;

    return record.teachers.filter((teacher) => matchesTokenizedQuery([
      teacher.name,
      teacher.researcher_code,
      ...teacher.courses.flatMap((course) => [course.name, course.name_en]),
    ], query));
  });

  readonly visibleTeachers = computed(() =>
    this.filteredTeachers().slice(0, this.visibleTeacherLimit()),
  );

  readonly remainingTeacherCount = computed(() =>
    Math.max(0, this.filteredTeachers().length - this.visibleTeachers().length),
  );

  readonly activeCourseAssignmentCount = computed(() =>
    this.activeTeacherRecord()?.teachers.reduce(
      (total, teacher) => total + teacher.courses.length,
      0,
    ) ?? 0,
  );

  constructor() {
    this.restoreAdvisorState();
    void this.loadRegistry();
    void this.loadPerformerSearchRegistry();
  }

  setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.resetVisibleResults();
  }

  setCycle(event: Event): void {
    this.cycle.set((event.target as HTMLSelectElement).value);
    this.resetVisibleResults();
  }

  setInstitution(event: Event): void {
    this.institutionId.set((event.target as HTMLSelectElement).value);
    this.memberInstitutionId.set('all');
    this.resetVisibleResults();
  }

  setMemberInstitution(event: Event): void {
    this.memberInstitutionId.set((event.target as HTMLSelectElement).value);
    this.resetVisibleResults();
  }

  setIncludeInvalid(event: Event): void {
    this.includeInvalid.set((event.target as HTMLInputElement).checked);
    this.resetVisibleResults();
  }

  clearSearch(): void {
    this.query.set('');
    this.resetVisibleResults();
  }

  showMoreResults(): void {
    this.visibleResultLimit.update((limit) => limit + this.resultLimit);
  }

  startAdvisor(): void {
    this.advisorOpen.set(true);
    this.advisorStep.set(0);
    this.advisorAnswers.set({});
    this.advisorFinished.set(false);
    this.clearStoredAdvisorState();
  }

  resumeAdvisor(): void {
    this.advisorOpen.set(true);
  }

  closeAdvisor(): void {
    this.advisorOpen.set(false);
  }

  selectAdvisorAnswer(questionId: string, optionId: string): void {
    const question = this.advisorQuestions.find((candidate) =>
      candidate.id === questionId);
    if (!question?.options.some((option) => option.id === optionId)) return;

    if (question.allowMultiple) {
      this.advisorAnswers.update((answers) => {
        const currentSelections = answers[questionId] ?? [];
        const isSelected = currentSelections.includes(optionId);
        const maxSelections = question.maxSelections ?? question.options.length;
        const nextSelections = isSelected
          ? currentSelections.filter((selection) => selection !== optionId)
          : currentSelections.length < maxSelections
            ? [...currentSelections, optionId]
            : currentSelections;

        if (nextSelections.length > 0) {
          return { ...answers, [questionId]: nextSelections };
        }

        const { [questionId]: _removed, ...remainingAnswers } = answers;
        return remainingAnswers;
      });
      this.persistAdvisorState();
      return;
    }

    this.advisorAnswers.update((answers) => ({
      ...answers,
      [questionId]: [optionId],
    }));
    this.persistAdvisorState();
  }

  continueAdvisor(): void {
    const question = this.currentAdvisorQuestion();
    if (!question || !this.advisorAnswers()[question.id]?.length) return;

    this.advanceAdvisor();
  }

  isAdvisorOptionSelected(questionId: string, optionId: string): boolean {
    return this.advisorAnswers()[questionId]?.includes(optionId) ?? false;
  }

  isAdvisorOptionDisabled(question: AdvisorQuestion, optionId: string): boolean {
    if (!question.allowMultiple || this.isAdvisorOptionSelected(question.id, optionId)) {
      return false;
    }

    const maxSelections = question.maxSelections ?? question.options.length;
    return (this.advisorAnswers()[question.id]?.length ?? 0) >= maxSelections;
  }

  advisorSelectedCount(questionId: string): number {
    return this.advisorAnswers()[questionId]?.length ?? 0;
  }

  private advanceAdvisor(): void {
    if (this.advisorStep() === this.advisorQuestions.length - 1) {
      this.advisorFinished.set(true);
      this.persistAdvisorState();
      return;
    }

    this.advisorStep.update((step) => step + 1);
    this.persistAdvisorState();
  }

  previousAdvisorQuestion(): void {
    if (this.advisorStep() === 0) return;
    this.advisorFinished.set(false);
    this.advisorStep.update((step) => step - 1);
    this.persistAdvisorState();
  }

  restartAdvisor(): void {
    this.advisorOpen.set(true);
    this.advisorStep.set(0);
    this.advisorAnswers.set({});
    this.advisorFinished.set(false);
    this.clearStoredAdvisorState();
  }

  exploreAdvisorRecommendation(recommendation: AdvisorRecommendation): void {
    this.query.set(recommendation.result.item.name);
    this.cycle.set('all');
    this.institutionId.set('all');
    this.memberInstitutionId.set('all');
    this.includeInvalid.set(false);
    this.advisorOpen.set(false);
    this.resetVisibleResults();
  }

  searchMatchLabel(result: SearchResult): string {
    const match = result.match;
    if (!match) return '';

    const reason = match.reasons.join(' in ');
    return `Ujemanje v ${reason}${match.fuzzy ? ' · vključeno približno ujemanje' : ''}`;
  }

  showPerformerMatch(programmeId: string, performer: SearchPerformerMatch): void {
    this.expandTeacherDetails(programmeId, performer.teacherName);
  }

  toggleTeacherDetails(programmeId: string): void {
    if (this.expandedProgrammeId() === programmeId) {
      this.expandedProgrammeId.set(null);
      return;
    }

    this.expandTeacherDetails(programmeId);
  }

  retryTeachersLoad(): void {
    this.teachersError.set(false);
    void this.loadTeachersRegistry();
  }

  setTeacherQuery(event: Event): void {
    this.teacherQuery.set((event.target as HTMLInputElement).value);
    this.visibleTeacherLimit.set(this.teacherPageSize);
  }

  showMoreTeachers(): void {
    this.visibleTeacherLimit.update((limit) => limit + this.teacherPageSize);
  }

  teacherIdentity(teacher: ProgrammeTeacher): string {
    return [teacher.name, teacher.researcher_code, teacher.sicris_internal_id]
      .filter((value) => value !== null)
      .join('-');
  }

  durationLabel(years: number): string {
    if (years === 1) return '1 leto';
    if (years === 2) return '2 leti';
    if (years === 3 || years === 4) return `${years} leta`;
    return `${years} let`;
  }

  dateLabel(value: string): string {
    return new Intl.DateTimeFormat('sl-SI', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  }

  programmeUrl(programme: SearchResult): string {
    const cycle = programme.item.cycle.number
      ? `${programme.item.cycle.number}-st`
      : programme.item.cycle.code;
    const type = ['UN', 'VS'].includes(programme.item.type.short_name ?? '')
      ? programme.item.type.short_name
      : null;
    const slug = slugify([
      programme.institution?.abbreviation,
      programme.item.name,
      cycle,
      type,
    ].filter(Boolean).join('-'));

    return `https://portal.nakvis.si/javne-evidence/studijski-programi/${slug}/${encodeURIComponent(programme.item.id)}`;
  }

  private async loadRegistry(): Promise<void> {
    try {
      this.registry.set(await firstValueFrom(this.http.get<Registry>('data/slovenia-higher-education.json')));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPerformerSearchRegistry(): Promise<void> {
    try {
      this.performerSearchRegistry.set(await firstValueFrom(
        this.http.get<ProgrammePerformerSearchRegistry>(
          'data/programme-performer-search.json',
        ),
      ));
    } catch {
      this.performerSearchError.set(true);
    } finally {
      this.performerSearchLoading.set(false);
    }
  }

  private async loadTeachersRegistry(): Promise<void> {
    if (this.teachersLoading()) return;

    this.teachersLoading.set(true);
    this.teachersError.set(false);
    try {
      this.teachersRegistry.set(await firstValueFrom(
        this.http.get<ProgrammeTeachersRegistry>('data/programme-teachers.json'),
      ));
    } catch {
      this.teachersError.set(true);
    } finally {
      this.teachersLoading.set(false);
    }
  }

  private resetVisibleResults(): void {
    this.visibleResultLimit.set(this.resultLimit);
  }

  private expandTeacherDetails(programmeId: string, teacherQuery = ''): void {
    this.expandedProgrammeId.set(programmeId);
    this.teacherQuery.set(teacherQuery);
    this.visibleTeacherLimit.set(this.teacherPageSize);

    if (!this.teachersRegistry() && !this.teachersLoading()) {
      void this.loadTeachersRegistry();
    }
  }

  private restoreAdvisorState(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const storedValue = localStorage.getItem(ADVISOR_STORAGE_KEY)
        ?? localStorage.getItem(LEGACY_ADVISOR_STORAGE_KEY);
      if (!storedValue) return;

      const storedState = JSON.parse(storedValue) as {
        version?: unknown;
        answers?: unknown;
        step?: unknown;
        finished?: unknown;
      };
      if (
        (storedState.version !== 1 && storedState.version !== 2)
        || !storedState.answers
      ) {
        this.clearStoredAdvisorState();
        return;
      }

      const validAnswers = normalizeAdvisorAnswers(storedState.answers);

      if (Object.keys(validAnswers).length === 0) {
        this.clearStoredAdvisorState();
        return;
      }

      const allQuestionsAnswered = this.advisorQuestions.every((question) =>
        Boolean(validAnswers[question.id]?.length));
      const restoredStep = typeof storedState.step === 'number'
        && Number.isInteger(storedState.step)
        ? Math.min(
          Math.max(storedState.step, 0),
          this.advisorQuestions.length - 1,
        )
        : 0;

      this.advisorAnswers.set(validAnswers);
      this.advisorStep.set(allQuestionsAnswered
        ? this.advisorQuestions.length - 1
        : restoredStep);
      this.advisorFinished.set(storedState.finished === true && allQuestionsAnswered);
      if (storedState.version === 1) this.persistAdvisorState();
    } catch {
      this.clearStoredAdvisorState();
    }
  }

  private persistAdvisorState(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const state: StoredAdvisorState = {
      version: 2,
      answers: this.advisorAnswers(),
      step: this.advisorStep(),
      finished: this.advisorFinished(),
    };

    try {
      localStorage.setItem(ADVISOR_STORAGE_KEY, JSON.stringify(state));
      localStorage.removeItem(LEGACY_ADVISOR_STORAGE_KEY);
    } catch {
      // Aplikacija ostane uporabna tudi, ko brskalnik blokira lokalno shrambo.
    }
  }

  private clearStoredAdvisorState(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      localStorage.removeItem(ADVISOR_STORAGE_KEY);
      localStorage.removeItem(LEGACY_ADVISOR_STORAGE_KEY);
    } catch {
      // Brisanje ni nujno na voljo v zasebnem načinu ali omejenem okolju.
    }
  }
}

function normalize(value: string): string {
  return normalizeSearchText(value);
}

function slugify(value: string): string {
  return normalize(value)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}
