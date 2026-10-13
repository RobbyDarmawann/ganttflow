<?php

namespace App\Support;

use App\Models\Task;
use Illuminate\Support\Collection;

/**
 * Keeps the structural, derived parts of the schedule consistent:
 *
 *  - Summary (parent) tasks always mirror the span, duration and weighted
 *    progress of their children.
 *  - WBS codes are renumbered from the task hierarchy (1, 1.1, 1.2, 2, 2.1 ...)
 *    in schedule order, exactly like the auto-numbering in Microsoft Project.
 */
class ProjectStructure
{
    /**
     * Recalculate every derived structure for the whole project.
     */
    public function refresh(): void
    {
        $this->rollupSummaries();
        $this->resequenceWbsCodes();
    }

    /**
     * Push child spans and progress up into their summary tasks.
     */
    public function rollupSummaries(): void
    {
        $tasks = Task::query()->get();

        /** @var Collection<int, Collection<int, Task>> $childrenByParent */
        $childrenByParent = $tasks->groupBy(fn (Task $task): int => $task->parent_id ?? 0);

        $summaries = $tasks
            ->filter(fn (Task $task): bool => $task->isSummary())
            ->sortByDesc(fn (Task $task): int => count($task->ancestorIds()))
            ->values();

        foreach ($summaries as $summary) {
            $children = $childrenByParent->get($summary->id);

            if ($children === null || $children->isEmpty()) {
                continue;
            }

            $start = $children->map(fn (Task $task) => $task->start_date)->sort()->first();
            $end = $children->map(fn (Task $task) => $task->end_date)->sort()->last();

            $summary->forceFill([
                'start_date' => $start,
                'end_date' => $end,
                'duration_days' => WorkingCalendar::durationBetween($start, $end),
                'progress' => $this->weightedProgress($children),
            ])->save();
        }
    }

    /**
     * Renumber every task from the hierarchy in schedule order.
     */
    public function resequenceWbsCodes(): void
    {
        $tasks = Task::query()->get();

        /** @var Collection<int, Collection<int, Task>> $byParent */
        $byParent = $tasks->groupBy(fn (Task $task): int => $task->parent_id ?? 0);

        $visited = [];
        $this->assignCodes($byParent, null, '', $visited);
    }

    /**
     * Assign "1", "1.1", "1.1.2" style codes, depth first.
     *
     * @param  Collection<int, Collection<int, Task>>  $byParent
     * @param  array<int, bool>  $visited
     */
    private function assignCodes(
        Collection $byParent,
        ?int $parentId,
        string $prefix,
        array &$visited,
    ): void {
        $children = ($byParent->get($parentId ?? 0) ?? new Collection)
            ->reject(fn (Task $task): bool => isset($visited[$task->id]))
            ->sortBy([['start_date', 'asc'], ['id', 'asc']])
            ->values();

        foreach ($children as $index => $child) {
            $visited[$child->id] = true;
            $code = $prefix === '' ? (string) ($index + 1) : "{$prefix}.".($index + 1);

            if ($child->wbs_code !== $code) {
                $child->forceFill(['wbs_code' => $code])->saveQuietly();
            }

            $this->assignCodes($byParent, $child->id, $code, $visited);
        }
    }

    /**
     * Duration-weighted average progress of a set of child tasks.
     *
     * @param  Collection<int, Task>  $children
     */
    private function weightedProgress(Collection $children): int
    {
        if ($children->isEmpty()) {
            return 0;
        }

        // Milestones weigh in as a single day so they still count towards the
        // rollup instead of being averaged away.
        $totalWeight = (int) $children->sum(
            fn (Task $task): int => max(1, (int) $task->duration_days),
        );

        $weighted = (int) $children->sum(
            fn (Task $task): int => max(1, (int) $task->duration_days) * (int) $task->progress,
        );

        return (int) round($weighted / $totalWeight);
    }
}
