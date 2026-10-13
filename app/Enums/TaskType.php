<?php

namespace App\Enums;

enum TaskType: string
{
    case Regular = 'regular';
    case Summary = 'summary';
    case Milestone = 'milestone';

    /**
     * The label shown in the task form.
     */
    public function label(): string
    {
        return match ($this) {
            self::Regular => 'Regular Task',
            self::Summary => 'Summary / Parent Task',
            self::Milestone => 'Milestone',
        };
    }

    /**
     * Whether the type holds its own schedule (summary tasks roll up children).
     */
    public function isSchedulable(): bool
    {
        return $this !== self::Summary;
    }

    /**
     * Get every task type value.
     *
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(fn (self $type): string => $type->value, self::cases());
    }
}
