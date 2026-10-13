<?php

namespace App\Support;

use App\Enums\DependencyType;
use App\Enums\TaskType;
use App\Models\Task;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Critical Path Method analysis for the project schedule.
 *
 * Only "regular" and "milestone" activities take part in the dependency
 * network — summary tasks are rollups of their children and are excluded.
 *
 * All CPM values (early start/finish, slack, project duration) are expressed in
 * WORKING days measured from the project start, matching how Microsoft Project
 * and Primavera P6 report schedule metrics. The stored `start_date` /
 * `end_date` remain real calendar dates.
 *
 * Relation semantics with lag L:
 *  - FS: successor starts after the predecessor finishes   -> ES_s >= EF_p + L
 *  - SS: successor starts after the predecessor starts     -> ES_s >= ES_p + L
 *  - FF: successor finishes after the predecessor finishes -> ES_s >= EF_p + L - dur_s
 *  - SF: successor finishes after the predecessor starts   -> ES_s >= ES_p + L - dur_s
 *
 * A negative lag acts as a lead (the successor may overlap the predecessor).
 *
 * Total float ("slack") is measured by sensitivity instead of the classic
 * backward pass: an activity's float is the largest delay it can absorb before
 * the project finish moves. For FS/SS/FF networks this reproduces the textbook
 * LS/LF values exactly, and unlike a naive backward pass it stays correct for
 * Start-to-Finish links, where a successor's finish bounds its predecessor's
 * start and the two cannot be relaxed independently.
 *
 * @phpstan-type AnalysisNode array{
 *     id: int,
 *     wbs_code: string,
 *     name: string,
 *     task_type: string,
 *     is_milestone: bool,
 *     duration_days: int,
 *     early_start: int,
 *     early_finish: int,
 *     late_start: int,
 *     late_finish: int,
 *     slack: int,
 *     is_critical: bool
 * }
 * @phpstan-type Analysis array{
 *     has_tasks: bool,
 *     project_start: string|null,
 *     project_end: string|null,
 *     project_duration_days: int,
 *     critical_path_ids: array<int, int>,
 *     critical_path_names: array<int, string>,
 *     nodes: array<int, AnalysisNode>
 * }
 */
class CriticalPathAnalyzer
{
    /**
     * Analyse the given activities and return the schedule network.
     *
     * @param  Collection<int, Task>  $tasks
     * @return Analysis
     */
    public function analyze(Collection $tasks): array
    {
        $activities = $tasks->filter(
            fn (Task $task): bool => $task->task_type !== TaskType::Summary,
        )->values();

        if ($activities->isEmpty()) {
            return $this->emptyResult();
        }

        /** @var array<int, Task> $byId */
        $byId = $activities->keyBy('id')->all();

        $projectStart = $activities
            ->map(fn (Task $task): CarbonInterface => $task->start_date->copy()->startOfDay())
            ->sort()
            ->first();

        $schedule = $this->forwardPass($byId, $projectStart);

        $projectEnd = $schedule['early_finish'] === [] ? 0 : max($schedule['early_finish']);

        $nodes = [];

        foreach ($byId as $id => $task) {
            $slack = $this->totalFloat($byId, $projectStart, $id, $projectEnd);

            $nodes[$id] = [
                'id' => $id,
                'wbs_code' => $task->wbs_code,
                'name' => $task->name,
                'task_type' => $task->task_type->value,
                'is_milestone' => $task->isMilestone(),
                'duration_days' => $schedule['duration'][$id],
                'early_start' => $schedule['early_start'][$id],
                'early_finish' => $schedule['early_finish'][$id],
                'late_start' => $schedule['early_start'][$id] + $slack,
                'late_finish' => $schedule['early_finish'][$id] + $slack,
                'slack' => $slack,
                'is_critical' => $slack <= 0,
            ];
        }

        $critical = collect($byId)
            ->filter(fn (Task $task): bool => $nodes[$task->id]['is_critical'])
            ->sortBy(fn (Task $task): int => $schedule['early_start'][$task->id]);

        // The project window is reported from the real calendar dates so it
        // always matches the bars drawn on the chart, while the metrics above
        // stay in working-day offsets (CPM units).
        $projectEndDate = $activities
            ->map(fn (Task $task): CarbonInterface => $task->end_date->copy()->startOfDay())
            ->sort()
            ->last();

        return [
            'has_tasks' => true,
            'project_start' => $projectStart->toDateString(),
            'project_end' => $projectEndDate->toDateString(),
            'project_duration_days' => $projectEnd,
            'critical_path_ids' => $critical->map(fn (Task $task): int => $task->id)->values()->all(),
            'critical_path_names' => $critical->map(fn (Task $task): string => $task->name)->values()->all(),
            'nodes' => $nodes,
        ];
    }

    /**
     * Forward-schedule a set of activities purely from their dependencies.
     *
     * Returns the earliest start of every activity as a working-day offset from
     * the project start, which callers can turn into real dates with
     * {@see WorkingCalendar::addWorkingDays()}. Used by the seeder to lay out a
     * realistic project without hand-computing dates.
     *
     * @param  Collection<int, Task>  $tasks
     * @return array<int, int>
     */
    public function resolveStartOffsets(Collection $tasks): array
    {
        $activities = $tasks->filter(
            fn (Task $task): bool => $task->task_type !== TaskType::Summary,
        )->values();

        if ($activities->isEmpty()) {
            return [];
        }

        /** @var array<int, Task> $byId */
        $byId = $activities->keyBy('id')->all();

        $projectStart = $activities
            ->map(fn (Task $task): CarbonInterface => $task->start_date->copy()->startOfDay())
            ->sort()
            ->first();

        return $this->forwardPass($byId, $projectStart)['early_start'];
    }

    /**
     * Earliest start / finish of every activity.
     *
     * An activity never starts before its own `start_date`, which is why the
     * stored date acts as a minimum-start constraint. $delays shifts that
     * constraint for selected activities, which is how total float is measured.
     *
     * @param  array<int, Task>  $tasks
     * @param  array<int, int>  $delays
     * @return array{duration: array<int, int>, early_start: array<int, int>, early_finish: array<int, int>}
     */
    private function forwardPass(array $tasks, CarbonInterface $projectStart, array $delays = []): array
    {
        $duration = [];
        $earlyStart = [];
        $earlyFinish = [];

        foreach ($tasks as $id => $task) {
            $duration[$id] = max(0, (int) $task->duration_days);
            $earlyStart[$id] = WorkingCalendar::workingDaysBetween(
                $projectStart,
                $task->start_date,
            ) + ($delays[$id] ?? 0);
            $earlyFinish[$id] = $earlyStart[$id] + $duration[$id];
        }

        foreach ($this->topologicalOrder($tasks) as $id) {
            $predecessorId = $this->dependencyId($tasks[$id], $tasks);

            if ($predecessorId !== null) {
                $earlyStart[$id] = max(
                    $earlyStart[$id],
                    $this->forwardConstraint(
                        $tasks[$id],
                        $predecessorId,
                        $earlyStart,
                        $earlyFinish,
                        $duration,
                    ),
                );
            }

            $earlyFinish[$id] = $earlyStart[$id] + $duration[$id];
        }

        return [
            'duration' => $duration,
            'early_start' => $earlyStart,
            'early_finish' => $earlyFinish,
        ];
    }

    /**
     * How many working days an activity may slip before the project finish moves.
     *
     * Every activity is pushed later on its own, then the network is
     * rescheduled. Because a larger delay can only ever move the project finish
     * later, the predicate is monotone and can be binary searched.
     *
     * @param  array<int, Task>  $tasks
     */
    private function totalFloat(array $tasks, CarbonInterface $projectStart, int $id, int $projectEnd): int
    {
        // One more working day than the whole project already pushes this
        // activity past the finish, so the answer always lives in [0, upper].
        $upper = max(1, $projectEnd + 1);
        $low = 0;
        $high = $upper;

        while ($low < $high) {
            $mid = intdiv($low + $high + 1, 2);

            if ($this->projectEndWithDelay($tasks, $projectStart, $id, $mid) <= $projectEnd) {
                $low = $mid;
            } else {
                $high = $mid - 1;
            }
        }

        return $low;
    }

    /**
     * The project finish when one activity is delayed by the given working days.
     *
     * @param  array<int, Task>  $tasks
     */
    private function projectEndWithDelay(
        array $tasks,
        CarbonInterface $projectStart,
        int $id,
        int $delay,
    ): int {
        $schedule = $this->forwardPass($tasks, $projectStart, [$id => $delay]);

        return $schedule['early_finish'] === [] ? 0 : max($schedule['early_finish']);
    }

    /**
     * Order activities so every task appears after its predecessor.
     *
     * @param  array<int, Task>  $tasks
     * @return array<int, int>
     */
    private function topologicalOrder(array $tasks): array
    {
        $indegree = [];
        $successors = [];

        foreach ($tasks as $id => $task) {
            $indegree[$id] = 0;
            $predecessorId = $this->dependencyId($task, $tasks);

            if ($predecessorId === null) {
                continue;
            }

            $indegree[$id]++;
            $successors[$predecessorId][] = $id;
        }

        $queue = array_keys(array_filter($indegree, fn (int $degree): bool => $degree === 0));
        sort($queue);

        $order = [];

        for ($cursor = 0; $cursor < count($queue); $cursor++) {
            $id = $queue[$cursor];
            $order[] = $id;

            foreach ($successors[$id] ?? [] as $successorId) {
                $indegree[$successorId]--;

                if ($indegree[$successorId] === 0) {
                    $queue[] = $successorId;
                }
            }
        }

        // Guard against cycles: append whatever could not be ordered so the
        // analysis still renders instead of failing.
        if (count($order) < count($tasks)) {
            foreach (array_keys($tasks) as $id) {
                if (! in_array($id, $order, true)) {
                    $order[] = $id;
                }
            }
        }

        return $order;
    }

    /**
     * Resolve a task's predecessor, ignoring self references.
     *
     * @param  array<int, Task>  $tasks
     */
    private function dependencyId(Task $task, array $tasks): ?int
    {
        $predecessorId = $task->predecessor_id;

        if ($predecessorId === null || $predecessorId === $task->id) {
            return null;
        }

        return isset($tasks[$predecessorId]) ? $predecessorId : null;
    }

    /**
     * Earliest working-day offset the successor may start at.
     *
     * @param  array<int, int>  $earlyStart
     * @param  array<int, int>  $earlyFinish
     * @param  array<int, int>  $duration
     */
    private function forwardConstraint(
        Task $successor,
        int $predecessorId,
        array $earlyStart,
        array $earlyFinish,
        array $duration,
    ): int {
        $lag = (int) $successor->lag_days;

        return match ($successor->dependency_type) {
            DependencyType::StartToStart => $earlyStart[$predecessorId] + $lag,
            DependencyType::FinishToFinish => $earlyFinish[$predecessorId] + $lag - $duration[$successor->id],
            DependencyType::StartToFinish => $earlyStart[$predecessorId] + $lag - $duration[$successor->id],
            default => $earlyFinish[$predecessorId] + $lag,
        };
    }

    /**
     * @return Analysis
     */
    private function emptyResult(): array
    {
        return [
            'has_tasks' => false,
            'project_start' => null,
            'project_end' => null,
            'project_duration_days' => 0,
            'critical_path_ids' => [],
            'critical_path_names' => [],
            'nodes' => [],
        ];
    }
}
