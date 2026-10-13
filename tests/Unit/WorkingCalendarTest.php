<?php

use App\Support\WorkingCalendar;
use Carbon\CarbonImmutable;

function day(string $date): CarbonImmutable
{
    return CarbonImmutable::parse($date)->startOfDay();
}

test('weekends are not working days', function () {
    expect(WorkingCalendar::isWorkingDay(day('2026-01-05')))->toBeTrue()   // Monday
        ->and(WorkingCalendar::isWorkingDay(day('2026-01-06')))->toBeTrue()  // Tuesday
        ->and(WorkingCalendar::isWorkingDay(day('2026-01-09')))->toBeTrue()  // Friday
        ->and(WorkingCalendar::isWorkingDay(day('2026-01-10')))->toBeFalse() // Saturday
        ->and(WorkingCalendar::isWorkingDay(day('2026-01-11')))->toBeFalse(); // Sunday
});

test('working days are counted with an exclusive start and inclusive end', function () {
    expect(WorkingCalendar::workingDaysBetween(day('2026-01-05'), day('2026-01-05')))->toBe(0)
        ->and(WorkingCalendar::workingDaysBetween(day('2026-01-05'), day('2026-01-06')))->toBe(1)
        // Monday to the next Monday skips the weekend.
        ->and(WorkingCalendar::workingDaysBetween(day('2026-01-05'), day('2026-01-12')))->toBe(5)
        // Friday to Monday is a single working day.
        ->and(WorkingCalendar::workingDaysBetween(day('2026-01-09'), day('2026-01-12')))->toBe(1)
        // The count is signed when the range is reversed.
        ->and(WorkingCalendar::workingDaysBetween(day('2026-01-12'), day('2026-01-05')))->toBe(-5);
});

test('adding working days skips weekends', function () {
    expect(WorkingCalendar::addWorkingDays(day('2026-01-05'), 4)->toDateString())->toBe('2026-01-09')
        ->and(WorkingCalendar::addWorkingDays(day('2026-01-09'), 1)->toDateString())->toBe('2026-01-12')
        ->and(WorkingCalendar::addWorkingDays(day('2026-01-12'), -1)->toDateString())->toBe('2026-01-09')
        ->and(WorkingCalendar::addWorkingDays(day('2026-01-05'), 0)->toDateString())->toBe('2026-01-05');
});

test('a duration finishes on the correct working day', function () {
    // A 5 day task that starts on Monday ends on Friday.
    expect(WorkingCalendar::finishDate(day('2026-01-05'), 5)->toDateString())->toBe('2026-01-09')
        // A 1 day task starts and ends on the same day.
        ->and(WorkingCalendar::finishDate(day('2026-01-05'), 1)->toDateString())->toBe('2026-01-05')
        // Milestones (zero or negative duration) never move the date.
        ->and(WorkingCalendar::finishDate(day('2026-01-05'), 0)->toDateString())->toBe('2026-01-05');
});

test('duration between two dates is inclusive', function () {
    expect(WorkingCalendar::durationBetween(day('2026-01-05'), day('2026-01-09')))->toBe(5)
        ->and(WorkingCalendar::durationBetween(day('2026-01-05'), day('2026-01-05')))->toBe(1)
        ->and(WorkingCalendar::durationBetween(day('2026-01-09'), day('2026-01-12')))->toBe(2);
});

test('dates snap forward to the next working day', function () {
    expect(WorkingCalendar::snapToWorkingDay(day('2026-01-10'))->toDateString())->toBe('2026-01-12')
        ->and(WorkingCalendar::snapToWorkingDay(day('2026-01-11'))->toDateString())->toBe('2026-01-12')
        ->and(WorkingCalendar::snapToWorkingDay(day('2026-01-07'))->toDateString())->toBe('2026-01-07');
});
