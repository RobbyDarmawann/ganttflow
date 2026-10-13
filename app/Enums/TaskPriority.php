<?php

namespace App\Enums;

enum TaskPriority: string
{
    case Low = 'Low';
    case Normal = 'Normal';
    case High = 'High';
    case Critical = 'Critical';

    /**
     * The human readable label for the priority.
     */
    public function label(): string
    {
        return $this->value;
    }

    /**
     * Get every priority value.
     *
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(fn (self $priority): string => $priority->value, self::cases());
    }
}
