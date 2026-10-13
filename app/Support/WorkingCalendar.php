<?php

namespace App\Support;

use Carbon\CarbonInterface;

/**
 * A simple Monday-to-Friday working calendar.
 *
 * Durations, early/late dates and the Gantt timeline are all expressed in
 * working days, while `start_date` / `end_date` remain real calendar dates.
 * Weekends are treated as non-working days (no holiday table).
 */
class WorkingCalendar
{
    private const SUNDAY = 0;

    private const SATURDAY = 6;

    /**
     * Whether the given date is a working day (Monday through Friday).
     */
    public static function isWorkingDay(CarbonInterface $date): bool
    {
        return ! in_array($date->dayOfWeek, [self::SUNDAY, self::SATURDAY], true);
    }

    /**
     * Count the working days between two dates.
     *
     * The start day is excluded and the end day is included, so
     * Monday -> Tuesday is one working day and Monday -> Monday is zero.
     * The result is negative when $to is before $from.
     */
    public static function workingDaysBetween(CarbonInterface $from, CarbonInterface $to): int
    {
        $start = $from->copy()->startOfDay();
        $end = $to->copy()->startOfDay();

        if ($start->equalTo($end)) {
            return 0;
        }

        if ($end->lessThan($start)) {
            return -self::workingDaysBetween($end, $start);
        }

        $days = (int) $start->diffInDays($end);
        $fullWeeks = intdiv($days, 7);
        $count = $fullWeeks * 5;
        $cursor = $start->copy()->addDays($fullWeeks * 7);

        for ($index = 0; $index < $days % 7; $index++) {
            $cursor = $cursor->addDays(1);

            if (self::isWorkingDay($cursor)) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * Move a date forward (or backward) by a number of working days.
     */
    public static function addWorkingDays(CarbonInterface $from, int $days): CarbonInterface
    {
        $cursor = $from->copy()->startOfDay();
        $step = $days < 0 ? -1 : 1;
        $remaining = abs($days);

        while ($remaining > 0) {
            $cursor = $cursor->addDays($step);

            if (self::isWorkingDay($cursor)) {
                $remaining--;
            }
        }

        return $cursor;
    }

    /**
     * The finish date of a task that starts on $start and lasts $durationDays
     * working days. A zero (or negative) duration finishes the same day, which
     * is how milestones are represented.
     */
    public static function finishDate(CarbonInterface $start, int $durationDays): CarbonInterface
    {
        $start = $start->copy()->startOfDay();

        if ($durationDays <= 0) {
            return $start;
        }

        return self::addWorkingDays($start, $durationDays - 1);
    }

    /**
     * How many working days a task spans between two dates (inclusive).
     */
    public static function durationBetween(CarbonInterface $start, CarbonInterface $finish): int
    {
        return self::workingDaysBetween($start, $finish) + 1;
    }

    /**
     * The first working day on or after the given date.
     */
    public static function snapToWorkingDay(CarbonInterface $date): CarbonInterface
    {
        $cursor = $date->copy()->startOfDay();

        while (! self::isWorkingDay($cursor)) {
            $cursor = $cursor->addDays(1);
        }

        return $cursor;
    }
}
