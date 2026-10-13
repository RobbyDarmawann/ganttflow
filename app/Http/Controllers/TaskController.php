<?php

namespace App\Http\Controllers;

use App\Enums\DependencyType;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Http\Requests\TaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Support\CriticalPathAnalyzer;
use App\Support\ProjectStructure;
use App\Support\WorkingCalendar;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class TaskController extends Controller
{
    public function __construct(
        private readonly CriticalPathAnalyzer $analyzer,
        private readonly ProjectStructure $structure,
    ) {}

    /**
     * Display the GanttFlow scheduler with every task and the CPM analysis.
     */
    public function index(): Response
    {
        $tasks = Task::query()
            ->with(['parent', 'predecessor'])
            ->orderBy('start_date')
            ->orderBy('id')
            ->get();

        return Inertia::render('Tasks/Index', [
            'tasks' => TaskResource::collection($tasks)->resolve(),
            'analysis' => $this->analyzer->analyze($tasks),
            'options' => [
                'taskTypes' => TaskType::values(),
                'taskTypeLabels' => $this->taskTypeLabels(),
                'priorities' => TaskPriority::values(),
                'statuses' => TaskStatus::values(),
                'dependencyTypes' => DependencyType::values(),
                'dependencyLabels' => $this->dependencyLabels(),
                'workingDays' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            ],
        ]);
    }

    /**
     * Store a freshly created task.
     */
    public function store(TaskRequest $request): RedirectResponse
    {
        Task::create($request->validated());
        $this->structure->refresh();

        return to_route('tasks.index')->with('success', 'Tugas berhasil ditambahkan.');
    }

    /**
     * Update an existing task.
     */
    public function update(TaskRequest $request, Task $task): RedirectResponse
    {
        $task->update($request->validated());
        $this->structure->refresh();

        return to_route('tasks.index')->with('success', 'Tugas berhasil diperbarui.');
    }

    /**
     * Move or resize a task directly from the Gantt chart.
     *
     * Called by the bar drag (start_date) and resize (duration_days) actions, so
     * it deliberately accepts a minimal payload and recomputes the end date.
     */
    public function schedule(Request $request, Task $task): RedirectResponse
    {
        abort_if($task->isSummary(), 422, 'Summary task mengikuti jadwal sub-tugasnya.');

        $validated = $request->validate([
            'start_date' => ['required', 'date'],
            'duration_days' => ['integer', 'min:0', 'max:365'],
        ]);

        $duration = $task->isMilestone()
            ? 0
            : (int) ($validated['duration_days'] ?? $task->duration_days);

        $start = WorkingCalendar::snapToWorkingDay(
            Carbon::parse($validated['start_date']),
        );

        $task->update([
            'start_date' => $start,
            'duration_days' => $duration,
            'end_date' => WorkingCalendar::finishDate($start, $duration),
        ]);

        $this->structure->refresh();

        return back()->with('success', 'Jadwal tugas diperbarui.');
    }

    /**
     * Remove a task from the schedule.
     */
    public function destroy(Task $task): RedirectResponse
    {
        $task->delete();
        $this->structure->refresh();

        return to_route('tasks.index')->with('success', 'Tugas berhasil dihapus.');
    }

    /**
     * @return array<string, string>
     */
    private function taskTypeLabels(): array
    {
        $labels = [];

        foreach (TaskType::cases() as $type) {
            $labels[$type->value] = $type->label();
        }

        return $labels;
    }

    /**
     * @return array<string, string>
     */
    private function dependencyLabels(): array
    {
        $labels = [];

        foreach (DependencyType::cases() as $type) {
            $labels[$type->value] = $type->label();
        }

        return $labels;
    }
}
