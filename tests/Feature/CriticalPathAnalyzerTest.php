<?php

use App\Enums\DependencyType;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Task;
use App\Support\CriticalPathAnalyzer;

function analyze(): array
{
    return app(CriticalPathAnalyzer::class)->analyze(
        Task::query()->orderBy('start_date')->orderBy('id')->get(),
    );
}

/**
 * Slack of the task with the given name, or null when it is not in the network.
 */
function slackOf(string $name): ?int
{
    $analysis = analyze();

    foreach ($analysis['nodes'] as $node) {
        if ($node['name'] === $name) {
            return $node['slack'];
        }
    }

    return null;
}

test('a finish-to-start chain is fully critical', function () {
    $first = Task::factory()->startingOn('2026-01-05')->lasting(3)->create(['name' => 'A']);
    Task::factory()->startingOn('2026-01-08')->lasting(2)->after($first)->create(['name' => 'B']);

    $analysis = analyze();

    expect($analysis['project_duration_days'])->toBe(5)
        ->and($analysis['critical_path_names'])->toBe(['A', 'B'])
        ->and(slackOf('A'))->toBe(0)
        ->and(slackOf('B'))->toBe(0);
});

test('a lag delays the successor and lengthens the project', function () {
    $first = Task::factory()->startingOn('2026-01-05')->lasting(3)->create(['name' => 'A']);
    Task::factory()
        ->startingOn('2026-01-12')->lasting(2)
        ->after($first, DependencyType::FinishToStart, 2)
        ->create(['name' => 'B']);

    $analysis = analyze();

    expect($analysis['project_duration_days'])->toBe(7)
        ->and($analysis['project_end'])->toBe('2026-01-13')
        ->and(slackOf('A'))->toBe(0)
        // The two day lag makes B start five working days after A starts.
        ->and($analysis['nodes'][$first->id]['early_start'])->toBe(0)
        ->and($analysis['nodes'][Task::query()->where('name', 'B')->value('id')]['early_start'])->toBe(5);
});

test('start-to-start lets a successor run in parallel', function () {
    Task::factory()->startingOn('2026-01-05')->lasting(5)->create(['name' => 'A']);
    Task::factory()
        ->startingOn('2026-01-05')->lasting(3)
        ->after(Task::query()->where('name', 'A')->firstOrFail(), DependencyType::StartToStart)
        ->create(['name' => 'B']);

    $analysis = analyze();

    expect($analysis['project_duration_days'])->toBe(5)
        ->and(slackOf('A'))->toBe(0)
        // B finishes two working days before the project, so it has float.
        ->and(slackOf('B'))->toBe(2);
});

test('finish-to-finish ties both finishes together', function () {
    Task::factory()->startingOn('2026-01-05')->lasting(5)->create(['name' => 'A']);
    Task::factory()
        ->startingOn('2026-01-07')->lasting(3)
        ->after(Task::query()->where('name', 'A')->firstOrFail(), DependencyType::FinishToFinish)
        ->create(['name' => 'B']);

    $analysis = analyze();

    expect($analysis['project_duration_days'])->toBe(5)
        ->and(slackOf('A'))->toBe(0)
        ->and(slackOf('B'))->toBe(0);
});

test('start-to-finish pins the predecessor start to the successor finish', function () {
    // A starts on 2026-01-07 and lasts two days, so it finishes on 2026-01-08.
    $predecessor = Task::factory()->startingOn('2026-01-07')->lasting(2)->create(['name' => 'A']);

    // B must finish no earlier than A starts, so it is dragged back to 01-05.
    Task::factory()
        ->startingOn('2026-01-05')->lasting(2)
        ->after($predecessor, DependencyType::StartToFinish)
        ->create(['name' => 'B']);

    $analysis = analyze();

    expect($analysis['project_duration_days'])->toBe(4)
        ->and($analysis['project_end'])->toBe('2026-01-08')
        // Delaying A pushes the project finish, so A has no float...
        ->and(slackOf('A'))->toBe(0)
        // ...while B can slip two days before it would push A along.
        ->and(slackOf('B'))->toBe(2);
});

test('a branch that does not drive the finish keeps its float', function () {
    $first = Task::factory()->startingOn('2026-01-05')->lasting(2)->create(['name' => 'A']);
    Task::factory()->startingOn('2026-01-07')->lasting(5)->after($first)->create(['name' => 'B']);
    Task::factory()->startingOn('2026-01-07')->lasting(2)->after($first)->create(['name' => 'C']);

    $analysis = analyze();

    expect($analysis['project_duration_days'])->toBe(7)
        ->and($analysis['critical_path_names'])->toBe(['A', 'B'])
        ->and(slackOf('C'))->toBe(3);
});

test('milestones participate in the network with zero duration', function () {
    $phase = Task::factory()->startingOn('2026-01-05')->lasting(5)->create(['name' => 'Build']);
    Task::factory()
        ->startingOn('2026-01-12')
        ->milestone()
        ->after($phase)
        ->create(['name' => 'Go Live']);

    $analysis = analyze();
    $milestone = Task::query()->where('name', 'Go Live')->firstOrFail();

    expect($milestone->duration_days)->toBe(0)
        ->and($milestone->end_date->toDateString())->toBe($milestone->start_date->toDateString())
        ->and($analysis['project_duration_days'])->toBe(5)
        ->and($analysis['project_end'])->toBe('2026-01-12')
        ->and(slackOf('Go Live'))->toBe(0);
});

test('summary tasks stay out of the dependency network', function () {
    $summary = Task::factory()->summary()->create(['name' => 'Fase 1']);
    Task::factory()->startingOn('2026-01-05')->lasting(4)->create([
        'name' => 'Child',
        'parent_id' => $summary->id,
    ]);

    $analysis = analyze();

    expect($analysis['nodes'])->toHaveCount(1)
        ->and(slackOf('Child'))->toBe(0)
        ->and(slackOf('Fase 1'))->toBeNull();
});

test('a dependency cycle does not break the analysis', function () {
    $a = Task::factory()->startingOn('2026-01-05')->lasting(2)->create(['name' => 'A']);
    $b = Task::factory()->startingOn('2026-01-08')->lasting(2)->after($a)->create(['name' => 'B']);

    // Close the loop behind the validator's back.
    $a->forceFill(['predecessor_id' => $b->id])->saveQuietly();

    $analysis = analyze();

    expect($analysis['nodes'])->toHaveCount(2)
        ->and($analysis['has_tasks'])->toBeTrue();
});

test('an empty schedule reports no tasks', function () {
    $analysis = analyze();

    expect($analysis['has_tasks'])->toBeFalse()
        ->and($analysis['project_duration_days'])->toBe(0)
        ->and($analysis['nodes'])->toBe([]);
});

test('the model derives the end date and status from its inputs', function () {
    $task = Task::factory()->startingOn('2026-01-05')->lasting(5)->create([
        'progress' => 40,
        'task_type' => TaskType::Regular,
    ]);

    expect($task->end_date->toDateString())->toBe('2026-01-09')
        ->and($task->status)->toBe(TaskStatus::InProgress)
        ->and($task->isSummary())->toBeFalse();

    $task->update(['progress' => 100]);

    expect($task->refresh()->status)->toBe(TaskStatus::Completed);
});
