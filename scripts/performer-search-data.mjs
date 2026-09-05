export function createPerformerSearchRegistry(teachersRegistry) {
  const availableProgrammes = Object.values(teachersRegistry.programmes)
    .filter((programme) => programme.available);

  return {
    metadata: {
      generated_at: teachersRegistry.metadata.generated_at,
      programmes_with_data: availableProgrammes.length,
      teacher_records: teachersRegistry.metadata.counts.teacher_records,
      course_assignments: teachersRegistry.metadata.counts.course_assignments,
    },
    programmes: Object.fromEntries(
      availableProgrammes.map((programme) => [
        programme.programme_id,
        programme.teachers.map((teacher) => [
          teacher.name,
          teacher.researcher_code,
          teacher.courses.map((course) => [
            course.name,
            course.name_en,
            course.code,
          ]),
        ]),
      ]),
    ),
  };
}
