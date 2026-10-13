<?php

namespace App\Enums;

enum DependencyType: string
{
    case FinishToStart = 'FS';
    case StartToStart = 'SS';
    case FinishToFinish = 'FF';
    case StartToFinish = 'SF';

    /**
     * The full relation name used in tooltips and forms.
     */
    public function description(): string
    {
        return match ($this) {
            self::FinishToStart => 'Finish-to-Start',
            self::StartToStart => 'Start-to-Start',
            self::FinishToFinish => 'Finish-to-Finish',
            self::StartToFinish => 'Start-to-Finish',
        };
    }

    /**
     * The full label shown in the dependency dropdown.
     */
    public function label(): string
    {
        return "{$this->description()} ({$this->value})";
    }

    /**
     * Whether the relation anchors on the predecessor's finish date.
     */
    public function anchorsOnFinish(): bool
    {
        return $this === self::FinishToStart || $this === self::FinishToFinish;
    }

    /**
     * Whether the relation anchors on the successor's finish date.
     */
    public function targetsFinish(): bool
    {
        return $this === self::FinishToFinish || $this === self::StartToFinish;
    }

    /**
     * Get every dependency type value.
     *
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(fn (self $type): string => $type->value, self::cases());
    }
}
