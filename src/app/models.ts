export interface Registry {
  metadata: Metadata;
  institutions: Institution[];
  study_programmes: StudyProgramme[];
}

export interface Metadata {
  generated_at: string;
  study_locations_generated_at?: string;
  counts: {
    valid_institutions: number;
    valid_study_programmes: number;
  };
}

export interface Institution {
  id: string;
  evs_code: string | null;
  name: string;
  name_en: string | null;
  abbreviation: string | null;
  institution_type: string;
  legal_form: string;
  website: string | null;
  parent_university_id: string | null;
  study_locations: string[];
  valid: boolean;
  study_programme_count: number;
  valid_study_programme_count: number;
}

export interface StudyProgramme {
  id: string;
  evs_code: string | null;
  name: string;
  name_en: string | null;
  institution_id: string;
  university_id: string | null;
  type: {
    code: number;
    name: string;
    short_name: string | null;
  };
  cycle: {
    code: string;
    number: number;
    name: string;
  };
  duration_years: number | null;
  professional_title: {
    male: string | null;
    female: string | null;
    abbreviated: string | null;
  };
  valid: boolean;
}

export interface ProgrammeTeachersRegistry {
  metadata: {
    generated_at: string;
    counts: {
      study_programmes: number;
      programmes_with_available_data: number;
      programmes_with_teachers: number;
      programmes_without_teachers: number;
      unavailable_programmes: number;
      teacher_records: number;
      course_assignments: number;
    };
  };
  programmes: Record<string, ProgrammeTeacherRecord>;
}

export interface ProgrammeTeacherRecord {
  programme_id: string;
  evs_code: string | null;
  name: string;
  available: boolean;
  teachers: ProgrammeTeacher[];
}

export interface ProgrammeTeacher {
  researcher_code: string | null;
  sicris_internal_id: number | null;
  name: string;
  courses: ProgrammeCourse[];
}

export interface ProgrammeCourse {
  code: string | null;
  name: string;
  name_en: string | null;
}

export interface ProgrammePerformerSearchRegistry {
  metadata: {
    generated_at: string;
    programmes_with_data: number;
    teacher_records: number;
    course_assignments: number;
  };
  programmes: Record<string, ProgrammePerformerSearchTeacher[]>;
}

export type ProgrammePerformerSearchTeacher = [
  name: string,
  researcherCode: string | null,
  courses: ProgrammePerformerSearchCourse[],
];

export type ProgrammePerformerSearchCourse = [
  name: string,
  nameEn: string | null,
  code: string | null,
];

export interface SearchPerformerMatch {
  teacherName: string;
  researcherCode?: string;
  courseName?: string;
}

export interface SearchResult {
  item: StudyProgramme;
  institution?: Institution;
  university?: Institution;
  match?: {
    score: number;
    reasons: string[];
    fuzzy: boolean;
    performers: SearchPerformerMatch[];
  };
}
