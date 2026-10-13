<?php

namespace App\Models;

use App\Enums\DependencyType;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Support\WorkingCalendar;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Database\Factories\TaskFactory;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property int $id
 * @property string $wbs_code
 * @property string $name
 * @property TaskType $task_type
 * @property CarbonInterface $start_date
 * @property CarbonInterface $end_date
 * @property int $duration_days
 * @property int $progress
 * @property TaskPriority $priority
 * @property int|null $parent_id
 * @property int|null $predecessor_id
 * @property DependencyType $dependency_type
 * @property int $lag_days
 * @property string|null $resource_names
 * @property TaskStatus $status
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 * @property-read Task|null $parent
 * @property-read Task|null $predecessor
 * @property-read Task|null $successor
 */
#[Fillable([
    'wbs_code',
    'name',
    'task_type',
    'start_date',
    'end_date',
    'duration_days',
    'progress',
    'priority',
    'parent_id',
    'predecessor_id',
    'dependency_type',
    'lag_days',
    'resource_names',
    'status',
])]
class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use HasFactory;

    /**
     * Keep the derived schedule attributes consistent on every write.
     */
    protected static function booted(): void
    {
        static::saving(function (Task $task): void {
            // Read the raw attributes so models built without dates do not
            // trip over typed properties before validation has run.
            /** @var mixed $startDate */
            $startDate = $task->getAttribute('start_date');
            /** @var mixed $durationDays */
            $durationDays = $task->getAttribute('duration_days');

            if ($task->task_type === TaskType::Milestone) {
                $task->duration_days = 0;

                if ($startDate instanceof DateTimeInterface) {
                    $task->end_date = CarbonImmutable::instance($startDate)->startOfDay();
                }
            } elseif ($startDate instanceof DateTimeInterface && $durationDays !== null) {
                $task->end_date = WorkingCalendar::finishDate(
                    CarbonImmutable::instance($startDate),
                    (int) $durationDays,
                );
            }

            $task->status = TaskStatus::fromProgress((int) $task->progress);
        });
    }

    /**
     * The phase / parent task this task belongs to.
     *
     * @return BelongsTo<Task, $this>
     */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'parent_id');
    }

    /**
     * The direct children of this task.
     *
     * @return HasMany<Task, $this>
     */
    public function children(): HasMany
    {
        return $this->hasMany(Task::class, 'parent_id')
            ->orderBy('start_date')
            ->orderBy('id');
    }

    /**
     * Every descendant of this task.
     *
     * @return HasMany<Task, $this>
     */
    public function descendants(): HasMany
    {
        return $this->children()->with('descendants');
    }

    /**
     * The task that must happen before this one.
     *
     * @return BelongsTo<Task, $this>
     */
    public function predecessor(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'predecessor_id');
    }

    /**
     * The task that depends on this one.
     *
     * @return HasOne<Task, $this>
     */
    public function successor(): HasOne
    {
        return $this->hasOne(Task::class, 'predecessor_id');
    }

    /**
     * Only the activities that take part in the dependency network.
     *
     * @param  Builder<Task>  $query
     */
    public function scopeSchedulable(Builder $query): void
    {
        $query->whereIn('task_type', [
            TaskType::Regular->value,
            TaskType::Milestone->value,
        ]);
    }

    public function isMilestone(): bool
    {
        return $this->task_type === TaskType::Milestone;
    }

    public function isSummary(): bool
    {
        return $this->task_type === TaskType::Summary;
    }

    /**
     * Walk up the parent chain and report every ancestor id.
     *
     * @return array<int, int>
     */
    public function ancestorIds(): array
    {
        $ancestors = [];
        $cursor = $this->parent;
        $guard = 0;

        while ($cursor !== null && $guard++ < 100) {
            if (in_array($cursor->id, $ancestors, true)) {
                break;
            }

            $ancestors[] = $cursor->id;
            $cursor = $cursor->parent;
        }

        return $ancestors;
    }

    /**
     * Walk up the predecessor chain and report every upstream task id.
     *
     * @return array<int, int>
     */
    public function predecessorChainIds(): array
    {
        $chain = [];
        $cursorId = $this->predecessor_id;
        $guard = 0;

        while ($cursorId !== null && $guard++ < 500) {
            if (in_array($cursorId, $chain, true)) {
                break;
            }

            $chain[] = $cursorId;
            $cursorId = Task::query()->whereKey($cursorId)->value('predecessor_id');
            $cursorId = $cursorId === null ? null : (int) $cursorId;
        }

        return $chain;
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'task_type' => TaskType::class,
            'start_date' => 'date',
            'end_date' => 'date',
            'duration_days' => 'integer',
            'progress' => 'integer',
            'priority' => TaskPriority::class,
            'dependency_type' => DependencyType::class,
            'lag_days' => 'integer',
            'status' => TaskStatus::class,
        ];
    }
}
