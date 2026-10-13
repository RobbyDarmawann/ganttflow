<?php

namespace App\Http\Requests;

use App\Enums\DependencyType;
use App\Enums\TaskPriority;
use App\Enums\TaskType;
use App\Models\Task;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class TaskRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $current = $this->currentTask();

        // A task may never reference itself as its parent or predecessor.
        $notSelf = $current !== null ? [Rule::notIn([$current->id])] : [];

        return [
            'name' => ['required', 'string', 'max:255'],
            'task_type' => ['required', Rule::in(TaskType::values())],
            'start_date' => ['required', 'date'],
            'duration_days' => ['required', 'integer', 'min:0', 'max:365'],
            'progress' => ['required', 'integer', 'min:0', 'max:100'],
            'priority' => ['required', Rule::in(TaskPriority::values())],
            'parent_id' => array_merge(
                ['nullable', 'integer', Rule::exists('tasks', 'id')],
                $notSelf,
            ),
            'predecessor_id' => array_merge(
                ['nullable', 'integer', Rule::exists('tasks', 'id')],
                $notSelf,
            ),
            'dependency_type' => ['required', Rule::in(DependencyType::values())],
            'lag_days' => ['required', 'integer', 'min:-365', 'max:365'],
            'resource_names' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Cross-field checks that plain rules cannot express.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $this->guardMilestoneDuration($validator);
            $this->guardPredecessorType($validator);
            $this->guardCircularDependency($validator);
            $this->guardCircularHierarchy($validator);
        });
    }

    /**
     * Get the custom validation messages.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'parent_id.not_in' => 'Tugas tidak dapat menjadi parent bagi dirinya sendiri.',
            'predecessor_id.not_in' => 'Tugas tidak dapat menjadi predecessor bagi dirinya sendiri.',
        ];
    }

    /**
     * Normalise the payload before validation.
     */
    protected function prepareForValidation(): void
    {
        $isMilestone = $this->input('task_type') === TaskType::Milestone->value;

        $this->merge([
            'parent_id' => $this->input('parent_id') ?: null,
            'predecessor_id' => $this->input('predecessor_id') ?: null,
            'dependency_type' => $this->input('dependency_type') ?: DependencyType::FinishToStart->value,
            'lag_days' => $this->input('lag_days') === null || $this->input('lag_days') === ''
                ? 0
                : (int) $this->input('lag_days'),
            // Milestones carry no duration.
            'duration_days' => $isMilestone ? 0 : $this->input('duration_days'),
        ]);
    }

    private function currentTask(): ?Task
    {
        $task = $this->route('task');

        return $task instanceof Task ? $task : null;
    }

    /**
     * Milestones must stay at zero days.
     */
    private function guardMilestoneDuration(Validator $validator): void
    {
        if (
            $this->input('task_type') === TaskType::Milestone->value
            && (int) $this->input('duration_days') !== 0
        ) {
            $validator->errors()->add('duration_days', 'Milestone harus memiliki durasi 0 hari.');
        }
    }

    /**
     * Summary tasks are rollups and cannot drive dependencies.
     */
    private function guardPredecessorType(Validator $validator): void
    {
        $predecessor = $this->resolvedPredecessor();

        if ($predecessor !== null && $predecessor->isSummary()) {
            $validator->errors()->add(
                'predecessor_id',
                'Summary task tidak dapat dijadikan predecessor. Pilih aktivitas regular atau milestone.',
            );
        }
    }

    /**
     * A task cannot become its own upstream dependency.
     */
    private function guardCircularDependency(Validator $validator): void
    {
        $current = $this->currentTask();
        $predecessor = $this->resolvedPredecessor();

        if ($current === null || $predecessor === null) {
            return;
        }

        if (in_array($current->id, $predecessor->predecessorChainIds(), true)) {
            $validator->errors()->add(
                'predecessor_id',
                'Dependensi melingkar terdeteksi: tugas ini berada di rantai predecessor yang dipilih.',
            );
        }
    }

    /**
     * A task cannot be moved underneath one of its own descendants.
     */
    private function guardCircularHierarchy(Validator $validator): void
    {
        $current = $this->currentTask();
        $parentId = $this->input('parent_id');

        if ($current === null || ! $parentId) {
            return;
        }

        $parent = Task::query()->find((int) $parentId);

        if ($parent === null) {
            return;
        }

        if ($parent->id === $current->id || in_array($current->id, $parent->ancestorIds(), true)) {
            $validator->errors()->add(
                'parent_id',
                'Struktur hirarki melingkar: tugas ini adalah leluhur dari parent yang dipilih.',
            );
        }
    }

    private function resolvedPredecessor(): ?Task
    {
        $predecessorId = $this->input('predecessor_id');

        if (! $predecessorId) {
            return null;
        }

        return Task::query()->find((int) $predecessorId);
    }
}
