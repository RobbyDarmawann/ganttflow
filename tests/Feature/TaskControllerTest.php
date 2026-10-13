<?php

use App\Enums\DependencyType;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Task;
use Inertia\Testing\AssertableInertia as Assert;

/**
 * A complete payload for the task modal.
 *
 * @return array<string, mixed>
 */
function taskPayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Analisis Kebutuhan',
        'task_type' => TaskType::Regular->value,
        'start_date' => '2026-01-05',
        'duration_days' => 5,
        'progress' => 0,
        'priority' => TaskPriority::Normal->value,
        'parent_id' => null,
        'predecessor_id' => null,
        'dependency_type' => DependencyType::FinishToStart->value,
        'lag_days' => 0,
        'resource_names' => null,
    ], $overrides);
}

test('renders the scheduler with tasks, analysis and options', function () {
    Task::factory()->count(3)->create();

    $this->get(route('tasks.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Tasks/Index')
            ->has('tasks', 3)
            ->has('tasks.0.wbs_code')
            ->has('tasks.0.task_type')
            ->has('tasks.0.resource_names')
            ->has('analysis.nodes')
            ->where('analysis.has_tasks', true)
            ->has('options.taskTypes', 3)
            ->has('options.priorities', 4)
            ->has('options.statuses', 3)
            ->has('options.dependencyTypes', 4)
            ->has('options.taskTypeLabels')
            ->has('options.dependencyLabels')
        );
});

test('stores a regular task with a finish-to-start predecessor and lag', function () {
    $predecessor = Task::factory()->startingOn('2026-01-05')->lasting(3)->create();

    $this->post(route('tasks.store'), taskPayload([
        'start_date' => '2026-01-12',
        'duration_days' => 5,
        'progress' => 20,
        'priority' => TaskPriority::High->value,
        'predecessor_id' => $predecessor->id,
        'lag_days' => 2,
        'resource_names' => 'Rani, Bagus',
    ]))->assertRedirect(route('tasks.index'));

    $created = Task::query()->where('name', 'Analisis Kebutuhan')->firstOrFail();

    expect($created->task_type)->toBe(TaskType::Regular)
        ->and($created->priority)->toBe(TaskPriority::High)
        ->and($created->status)->toBe(TaskStatus::InProgress)
        ->and($created->lag_days)->toBe(2)
        ->and($created->resource_names)->toBe('Rani, Bagus')
        ->and($created->end_date->toDateString())->toBe('2026-01-16')
        // WBS codes are assigned by the structure service after the insert.
        ->and($created->wbs_code)->not->toBe('');
});

test('a milestone is stored with zero duration', function () {
    $this->post(route('tasks.store'), taskPayload([
        'name' => 'Sign-Off Klien',
        'task_type' => TaskType::Milestone->value,
        'duration_days' => 0,
        'priority' => TaskPriority::Critical->value,
        'progress' => 100,
    ]))->assertRedirect(route('tasks.index'));

    $milestone = Task::query()->where('name', 'Sign-Off Klien')->firstOrFail();

    expect($milestone->duration_days)->toBe(0)
        ->and($milestone->end_date->toDateString())->toBe($milestone->start_date->toDateString())
        ->and($milestone->status)->toBe(TaskStatus::Completed);
});

test('a summary task rolls its children up', function () {
    $this->post(route('tasks.store'), taskPayload([
        'name' => 'Fase 1 — Inisiasi',
        'task_type' => TaskType::Summary->value,
    ]))->assertRedirect(route('tasks.index'));

    $summary = Task::query()->where('name', 'Fase 1 — Inisiasi')->firstOrFail();

    $this->post(route('tasks.store'), taskPayload([
        'name' => 'Anak 1',
        'start_date' => '2026-01-05',
        'duration_days' => 5,
        'progress' => 100,
        'parent_id' => $summary->id,
    ]))->assertRedirect(route('tasks.index'));

    $this->post(route('tasks.store'), taskPayload([
        'name' => 'Anak 2',
        'start_date' => '2026-01-12',
        'duration_days' => 5,
        'progress' => 50,
        'parent_id' => $summary->id,
    ]))->assertRedirect(route('tasks.index'));

    $summary->refresh();

    expect($summary->start_date->toDateString())->toBe('2026-01-05')
        ->and($summary->end_date->toDateString())->toBe('2026-01-16')
        ->and($summary->duration_days)->toBe(10)
        ->and($summary->progress)->toBe(75)
        ->and($summary->wbs_code)->toBe('1')
        ->and(Task::query()->where('name', 'Anak 1')->value('wbs_code'))->toBe('1.1')
        ->and(Task::query()->where('name', 'Anak 2')->value('wbs_code'))->toBe('1.2');
});

test('updates an existing task', function () {
    $task = Task::factory()->startingOn('2026-01-05')->lasting(2)->create(['name' => 'Lama']);

    $this->put(route('tasks.update', $task), taskPayload([
        'name' => 'Estimasi Durasi',
        'start_date' => '2026-01-07',
        'duration_days' => 6,
        'progress' => 55,
        'priority' => TaskPriority::Critical->value,
    ]))->assertRedirect(route('tasks.index'));

    $task->refresh();

    expect($task->name)->toBe('Estimasi Durasi')
        ->and($task->duration_days)->toBe(6)
        ->and($task->progress)->toBe(55)
        ->and($task->priority)->toBe(TaskPriority::Critical)
        ->and($task->status)->toBe(TaskStatus::InProgress)
        ->and($task->end_date->toDateString())->toBe('2026-01-14');
});

test('deletes a task', function () {
    $task = Task::factory()->create();

    $this->delete(route('tasks.destroy', $task))->assertRedirect(route('tasks.index'));

    $this->assertDatabaseMissing('tasks', ['id' => $task->id]);
});

test('reschedules a task from the gantt chart', function () {
    $task = Task::factory()->startingOn('2026-01-05')->lasting(5)->create();

    $this->patch(route('tasks.schedule', $task), [
        'start_date' => '2026-01-12',
        'duration_days' => 3,
    ])->assertRedirect();

    $task->refresh();

    expect($task->start_date->toDateString())->toBe('2026-01-12')
        ->and($task->duration_days)->toBe(3)
        ->and($task->end_date->toDateString())->toBe('2026-01-14');
});

test('a drag onto a weekend snaps to the next working day', function () {
    $task = Task::factory()->startingOn('2026-01-05')->lasting(3)->create();

    $this->patch(route('tasks.schedule', $task), [
        'start_date' => '2026-01-10', // Saturday
        'duration_days' => 3,
    ])->assertRedirect();

    expect($task->refresh()->start_date->toDateString())->toBe('2026-01-12');
});

test('a summary task cannot be dragged', function () {
    $summary = Task::factory()->summary()->create();

    $this->patch(route('tasks.schedule', $summary), [
        'start_date' => '2026-01-05',
        'duration_days' => 4,
    ])->assertStatus(422);
});

test('a milestone cannot gain a duration', function () {
    $milestone = Task::factory()->startingOn('2026-01-05')->milestone()->create();

    $this->patch(route('tasks.schedule', $milestone), [
        'start_date' => '2026-01-05',
        'duration_days' => 9,
    ])->assertRedirect();

    expect($milestone->refresh()->duration_days)->toBe(0);
});

test('rejects a task that is its own predecessor', function () {
    $task = Task::factory()->create();

    $this->from(route('tasks.index'))
        ->put(route('tasks.update', $task), taskPayload([
            'name' => $task->name,
            'predecessor_id' => $task->id,
        ]))
        ->assertSessionHasErrors('predecessor_id');
});

test('rejects a circular dependency', function () {
    $a = Task::factory()->startingOn('2026-01-05')->lasting(2)->create(['name' => 'A']);
    $b = Task::factory()->startingOn('2026-01-08')->lasting(2)->after($a)->create(['name' => 'B']);

    // B already depends on A, so A may not depend on B.
    $this->from(route('tasks.index'))
        ->put(route('tasks.update', $a), taskPayload([
            'name' => 'A',
            'start_date' => '2026-01-05',
            'duration_days' => 2,
            'predecessor_id' => $b->id,
        ]))
        ->assertSessionHasErrors('predecessor_id');
});

test('rejects a summary task as a predecessor', function () {
    $summary = Task::factory()->summary()->create(['name' => 'Fase Besar']);

    $this->from(route('tasks.index'))
        ->post(route('tasks.store'), taskPayload([
            'name' => 'Kegiatan Baru',
            'predecessor_id' => $summary->id,
        ]))
        ->assertSessionHasErrors('predecessor_id');
});

test('rejects a parent that would create a hierarchy cycle', function () {
    $parent = Task::factory()->create(['name' => 'Induk']);
    $child = Task::factory()->create([
        'name' => 'Anak',
        'parent_id' => $parent->id,
    ]);

    $this->from(route('tasks.index'))
        ->put(route('tasks.update', $parent), taskPayload([
            'name' => 'Induk',
            'parent_id' => $child->id,
        ]))
        ->assertSessionHasErrors('parent_id');
});

test('validates the required fields', function () {
    $this->from(route('tasks.index'))
        ->post(route('tasks.store'), [])
        ->assertSessionHasErrors([
            'name',
            'task_type',
            'start_date',
            'duration_days',
            'progress',
            'priority',
        ]);
});

test('rejects a progress value outside the allowed range', function () {
    $this->from(route('tasks.index'))
        ->post(route('tasks.store'), taskPayload(['progress' => 130]))
        ->assertSessionHasErrors('progress');
});
