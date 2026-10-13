<?php

namespace App\Http\Resources;

use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Task
 */
class TaskResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'wbs_code' => $this->wbs_code,
            'name' => $this->name,
            'task_type' => $this->task_type->value,
            'start_date' => $this->start_date->toDateString(),
            'end_date' => $this->end_date->toDateString(),
            'duration_days' => $this->duration_days,
            'progress' => $this->progress,
            'priority' => $this->priority->value,
            'parent_id' => $this->parent_id,
            'parent_name' => $this->whenLoaded('parent', fn () => $this->parent?->name),
            'predecessor_id' => $this->predecessor_id,
            'predecessor_name' => $this->whenLoaded('predecessor', fn () => $this->predecessor?->name),
            'predecessor_wbs_code' => $this->whenLoaded('predecessor', fn () => $this->predecessor?->wbs_code),
            'dependency_type' => $this->dependency_type->value,
            'lag_days' => $this->lag_days,
            'resource_names' => $this->resource_names,
            'status' => $this->status->value,
        ];
    }
}
