<?php

namespace Database\Factories;

use App\Enums\DependencyType;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Task;
use App\Support\WorkingCalendar;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Task>
 */
class TaskFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $start = WorkingCalendar::snapToWorkingDay(CarbonImmutable::now()->startOfDay());
        $duration = fake()->numberBetween(1, 10);

        return [
            'wbs_code' => '',
            'name' => fake()->unique()->sentence(3),
            'task_type' => TaskType::Regular,
            'start_date' => $start,
            'end_date' => WorkingCalendar::finishDate($start, $duration),
            'duration_days' => $duration,
            'progress' => 0,
            'priority' => fake()->randomElement(TaskPriority::cases()),
            'parent_id' => null,
            'predecessor_id' => null,
            'dependency_type' => DependencyType::FinishToStart,
            'lag_days' => 0,
            'resource_names' => null,
            'status' => TaskStatus::NotStarted,
        ];
    }

    /**
     * Indicate that the task starts on the given date.
     */
    public function startingOn(string|CarbonImmutable $date): static
    {
        return $this->state(function (array $attributes) use ($date): array {
            $start = CarbonImmutable::parse($date)->startOfDay();
            $duration = (int) $attributes['duration_days'];

            return [
                'start_date' => $start,
                'end_date' => WorkingCalendar::finishDate($start, $duration),
            ];
        });
    }

    /**
     * Indicate that the task lasts for the given number of working days.
     */
    public function lasting(int $days): static
    {
        return $this->state(function (array $attributes) use ($days): array {
            return [
                'duration_days' => $days,
                'end_date' => WorkingCalendar::finishDate($attributes['start_date'], $days),
            ];
        });
    }

    /**
     * Indicate the completion percentage.
     */
    public function withProgress(int $progress): static
    {
        return $this->state(fn (array $attributes): array => [
            'progress' => $progress,
            'status' => TaskStatus::fromProgress($progress),
        ]);
    }

    /**
     * Make a zero-duration milestone.
     */
    public function milestone(): static
    {
        return $this->state(fn (array $attributes): array => [
            'task_type' => TaskType::Milestone,
            'duration_days' => 0,
            'end_date' => $attributes['start_date'],
        ]);
    }

    /**
     * Make a summary (parent) task.
     */
    public function summary(): static
    {
        return $this->state(fn (array $attributes): array => [
            'task_type' => TaskType::Summary,
            'predecessor_id' => null,
        ]);
    }

    /**
     * Indicate that the task depends on the given predecessor.
     */
    public function after(
        Task $predecessor,
        DependencyType $type = DependencyType::FinishToStart,
        int $lag = 0,
    ): static {
        return $this->state(fn (array $attributes): array => [
            'predecessor_id' => $predecessor->id,
            'dependency_type' => $type,
            'lag_days' => $lag,
        ]);
    }
}
