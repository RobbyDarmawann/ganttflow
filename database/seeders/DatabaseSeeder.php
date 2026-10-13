<?php

namespace Database\Seeders;

use App\Enums\DependencyType;
use App\Enums\TaskPriority;
use App\Enums\TaskType;
use App\Models\Task;
use App\Support\CriticalPathAnalyzer;
use App\Support\ProjectStructure;
use App\Support\WorkingCalendar;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

/**
 * @phpstan-type PlanItem array{
 *     key: string,
 *     name: string,
 *     type: TaskType,
 *     duration: int,
 *     progress: int,
 *     priority: TaskPriority,
 *     resources: string|null,
 *     parent: string|null,
 *     predecessor: string|null,
 *     dependency: DependencyType,
 *     lag: int
 * }
 */
class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * Case study: "Proyek Pengembangan Sistem Informasi Kelola Pemberkasan".
     *
     * The plan only declares durations and dependencies — start and end dates
     * are forward-scheduled from the dependency network, then summary tasks and
     * WBS codes are rolled up, producing a realistic project with a genuine
     * critical path.
     */
    public function run(): void
    {
        Task::query()->delete();

        $projectStart = WorkingCalendar::snapToWorkingDay(
            CarbonImmutable::parse('2026-09-14'),
        );

        $plan = $this->plan();

        /** @var array<string, Task> $byKey */
        $byKey = [];

        // Pass 1: create every task and wire the parent hierarchy.
        foreach ($plan as $item) {
            $byKey[$item['key']] = Task::create([
                'name' => $item['name'],
                'task_type' => $item['type'],
                'start_date' => $projectStart,
                'end_date' => $projectStart,
                'duration_days' => $item['duration'],
                'progress' => $item['progress'],
                'priority' => $item['priority'],
                'parent_id' => $item['parent'] === null
                    ? null
                    : $byKey[$item['parent']]->id,
                'dependency_type' => $item['dependency'],
                'lag_days' => $item['lag'],
                'resource_names' => $item['resources'],
            ]);
        }

        // Pass 2: link predecessors now that every task has an id.
        foreach ($plan as $item) {
            if ($item['predecessor'] === null) {
                continue;
            }

            $byKey[$item['key']]->forceFill([
                'predecessor_id' => $byKey[$item['predecessor']]->id,
            ])->saveQuietly();
        }

        // Pass 3: forward-schedule the activities from their dependencies.
        $analyzer = app(CriticalPathAnalyzer::class);
        $activities = Task::query()->schedulable()->get();
        $offsets = $analyzer->resolveStartOffsets($activities);

        foreach ($activities as $activity) {
            $duration = $activity->isMilestone() ? 0 : (int) $activity->duration_days;
            $start = WorkingCalendar::addWorkingDays(
                $projectStart,
                $offsets[$activity->id] ?? 0,
            );

            $activity->forceFill([
                'start_date' => $start,
                'end_date' => WorkingCalendar::finishDate($start, $duration),
                'duration_days' => $duration,
            ])->save();
        }

        // Pass 4: roll summary dates/progress up and number the WBS.
        app(ProjectStructure::class)->refresh();
    }

    /**
     * The project plan: four phases with activities and a closing milestone.
     *
     * @return array<int, PlanItem>
     */
    private function plan(): array
    {
        return [
            // Phase 1 — completed.
            $this->phase('p1', 'Fase 1 — Inisiasi & Perencanaan'),
            $this->task('t11', 'p1', 'Identifikasi Kebutuhan Pengguna', 5, 100, TaskPriority::High, 'Rani, Dimas'),
            $this->task('t12', 'p1', 'Penyusunan Dokumen Kebutuhan Sistem', 4, 100, TaskPriority::High, 'Rani, Sinta', 't11'),
            $this->milestone('t13', 'p1', 'Sign-Off Perencanaan', 100, 'Project Manager, Klien', 't12'),

            // Phase 2 — analysis complete, design under review.
            $this->phase('p2', 'Fase 2 — Analisis & Desain'),
            $this->task('t21', 'p2', 'Analisis Proses Bisnis Pemberkasan', 6, 100, TaskPriority::High, 'Dimas, Bayu', 't13'),
            $this->task('t22', 'p2', 'Perancangan ERD & Struktur Database', 5, 100, TaskPriority::High, 'Bayu, Sinta', 't21'),
            $this->task('t23', 'p2', 'Perancangan Antarmuka (UI/UX)', 7, 60, TaskPriority::Normal, 'Sinta, Alya', 't21', DependencyType::StartToStart, 1),
            $this->milestone('t24', 'p2', 'Review Desain & Approval Klien', 0, 'Project Manager, Klien', 't22'),

            // Phase 3 — implementation running in parallel.
            $this->phase('p3', 'Fase 3 — Implementasi'),
            $this->task('t31', 'p3', 'Setup Environment & Repositori', 2, 100, TaskPriority::Normal, 'Bayu', 't24'),
            $this->task('t32', 'p3', 'Pengembangan Modul Pendaftaran Berkas', 8, 45, TaskPriority::High, 'Bayu, Dimas', 't31'),
            $this->task('t33', 'p3', 'Pengembangan Modul Pencarian & Verifikasi Berkas', 7, 0, TaskPriority::Normal, 'Alya, Sinta', 't32', DependencyType::FinishToStart, 2),
            $this->task('t34', 'p3', 'Pengembangan Modul Pelaporan', 5, 0, TaskPriority::Normal, 'Dimas', 't32', DependencyType::StartToStart, 3),

            // Phase 4 — testing and release.
            $this->phase('p4', 'Fase 4 — Pengujian & Rilis'),
            $this->task('t41', 'p4', 'Pengujian Sistem (SIT)', 5, 0, TaskPriority::High, 'Sinta, Alya', 't33', DependencyType::FinishToFinish, 1),
            $this->task('t42', 'p4', 'Pengujian Penerimaan Pengguna (UAT)', 4, 0, TaskPriority::High, 'Klien, Project Manager', 't41'),
            $this->task('t43', 'p4', 'Perbaikan Bug Hasil UAT', 3, 0, TaskPriority::Normal, 'Bayu', 't42'),
            $this->task('t44', 'p4', 'Pelatihan & Dokumentasi Pengguna', 3, 0, TaskPriority::Normal, 'Sinta', 't42', DependencyType::StartToStart, -1),
            $this->milestone('t45', 'p4', 'Sign-Off Klien / Rilis Sistem', 0, 'Project Manager, Klien', 't43'),
        ];
    }

    /**
     * @return PlanItem
     */
    private function phase(string $key, string $name): array
    {
        return [
            'key' => $key,
            'name' => $name,
            'type' => TaskType::Summary,
            'duration' => 0,
            'progress' => 0,
            'priority' => TaskPriority::Normal,
            'resources' => null,
            'parent' => null,
            'predecessor' => null,
            'dependency' => DependencyType::FinishToStart,
            'lag' => 0,
        ];
    }

    /**
     * @return PlanItem
     */
    private function task(
        string $key,
        string $parent,
        string $name,
        int $duration,
        int $progress,
        TaskPriority $priority,
        string $resources,
        ?string $predecessor = null,
        DependencyType $dependency = DependencyType::FinishToStart,
        int $lag = 0,
    ): array {
        return [
            'key' => $key,
            'name' => $name,
            'type' => TaskType::Regular,
            'duration' => $duration,
            'progress' => $progress,
            'priority' => $priority,
            'resources' => $resources,
            'parent' => $parent,
            'predecessor' => $predecessor,
            'dependency' => $dependency,
            'lag' => $lag,
        ];
    }

    /**
     * @return PlanItem
     */
    private function milestone(
        string $key,
        string $parent,
        string $name,
        int $progress,
        string $resources,
        ?string $predecessor = null,
    ): array {
        return [
            'key' => $key,
            'name' => $name,
            'type' => TaskType::Milestone,
            'duration' => 0,
            'progress' => $progress,
            'priority' => TaskPriority::Critical,
            'resources' => $resources,
            'parent' => $parent,
            'predecessor' => $predecessor,
            'dependency' => DependencyType::FinishToStart,
            'lag' => 0,
        ];
    }
}
