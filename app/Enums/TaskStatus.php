<?php

namespace App\Enums;

enum TaskStatus: string
{
    case NotStarted = 'Not Started';
    case InProgress = 'In Progress';
    case Completed = 'Completed';

    /**
     * Derive the status implied by a completion percentage.
     */
    public static function fromProgress(int $progress): self
    {
        return match (true) {
            $progress <= 0 => self::NotStarted,
            $progress >= 100 => self::Completed,
            default => self::InProgress,
        };
    }

    /**
     * The human readable label for the status.
     */
    public function label(): string
    {
        return $this->value;
    }

    /**
     * Get every status value.
     *
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(fn (self $status): string => $status->value, self::cases());
    }
}
