import type {
    DependencyType,
    GanttRow,
    Task,
    TaskPriority,
    TaskStatus,
    Timeline,
    TimelineDay,
    TimelineTierCell,
    ZoomLevel,
} from '@/types/gantt';

export const MONTH_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
];

export const MONTH_LONG = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
];

export const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const ZOOM_CONFIG: Record<
    ZoomLevel,
    { dayWidth: number; label: string }
> = {
    day: { dayWidth: 40, label: 'Harian' },
    week: { dayWidth: 14, label: 'Mingguan' },
    month: { dayWidth: 6, label: 'Bulanan' },
};

export const LEFT_PANEL_WIDTH = 780;
export const ROW_HEIGHT = 34;
export const HEADER_HEIGHT = 56;
export const MIN_BAR_WIDTH = 6;
export const MILESTONE_SIZE = 15;

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
    Low: 'bg-slate-100 text-slate-700 ring-slate-200',
    Normal: 'bg-sky-50 text-sky-700 ring-sky-200',
    High: 'bg-amber-50 text-amber-700 ring-amber-200',
    Critical: 'bg-red-50 text-red-700 ring-red-200',
};

export const STATUS_STYLES: Record<TaskStatus, string> = {
    'Not Started': 'bg-gray-100 text-gray-600 ring-gray-200',
    'In Progress': 'bg-blue-50 text-blue-700 ring-blue-200',
    Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export const DEPENDENCY_LABELS: Record<DependencyType, string> = {
    FS: 'Finish-to-Start',
    SS: 'Start-to-Start',
    FF: 'Finish-to-Finish',
    SF: 'Start-to-Finish',
};

/* ------------------------------------------------------------------ */
/* Calendar helpers (UTC based so dates never shift with the timezone) */
/* ------------------------------------------------------------------ */

export function parseDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);

    return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

export function toIso(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);

    return next;
}

export function isWorkingDay(date: Date): boolean {
    const weekday = date.getUTCDay();

    return weekday !== 0 && weekday !== 6;
}

export function snapToWorkingDay(date: Date): Date {
    let cursor = date;

    while (!isWorkingDay(cursor)) {
        cursor = addDays(cursor, 1);
    }

    return cursor;
}

export function addWorkingDays(date: Date, days: number): Date {
    let cursor = date;
    const step = days < 0 ? -1 : 1;
    let remaining = Math.abs(days);

    while (remaining > 0) {
        cursor = addDays(cursor, step);

        if (isWorkingDay(cursor)) {
            remaining--;
        }
    }

    return cursor;
}

export function workingDaysBetween(from: Date, to: Date): number {
    if (from.getTime() === to.getTime()) {
        return 0;
    }

    if (to.getTime() < from.getTime()) {
        return -workingDaysBetween(to, from);
    }

    let cursor = from;
    let count = 0;

    while (cursor.getTime() < to.getTime()) {
        cursor = addDays(cursor, 1);

        if (isWorkingDay(cursor)) {
            count++;
        }
    }

    return count;
}

export function finishDate(start: Date, durationDays: number): Date {
    if (durationDays <= 0) {
        return start;
    }

    return addWorkingDays(start, durationDays - 1);
}

export function durationBetween(start: Date, finish: Date): number {
    return workingDaysBetween(start, finish) + 1;
}

function mondayOf(date: Date): Date {
    const weekday = date.getUTCDay();
    const delta = weekday === 0 ? -6 : 1 - weekday;

    return addDays(date, delta);
}

function sundayOf(date: Date): Date {
    const weekday = date.getUTCDay();

    return addDays(date, 6 - weekday);
}

export function formatShortDate(value: string): string {
    const date = parseDate(value);

    return `${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]}`;
}

export function formatLongDate(value: string | null): string {
    if (value === null) {
        return '—';
    }

    const date = parseDate(value);

    return `${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function todayIso(): string {
    return toIso(new Date());
}

/* ------------------------------------------------------------------ */
/* WBS ordering                                                        */
/* ------------------------------------------------------------------ */

function compareWbs(a: string, b: string): number {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    const length = Math.max(left.length, right.length);

    for (let index = 0; index < length; index++) {
        const diff = (left[index] ?? 0) - (right[index] ?? 0);

        if (diff !== 0) {
            return diff;
        }
    }

    return 0;
}

/**
 * Flatten the task tree into the rows shown in the WBS grid, honouring the
 * collapsed set. Children are ordered by WBS code so the grid mirrors the
 * numbering assigned by the backend.
 */
export function flattenTree(
    tasks: Task[],
    collapsed: ReadonlySet<number>,
): GanttRow[] {
    const ids = new Set(tasks.map((task) => task.id));
    const buckets = new Map<number | null, Task[]>();

    for (const task of tasks) {
        const key =
            task.parent_id !== null && ids.has(task.parent_id)
                ? task.parent_id
                : null;

        const bucket = buckets.get(key) ?? [];
        bucket.push(task);
        buckets.set(key, bucket);
    }

    for (const bucket of buckets.values()) {
        bucket.sort(
            (a, b) => compareWbs(a.wbs_code, b.wbs_code) || a.id - b.id,
        );
    }

    const rows: GanttRow[] = [];
    const seen = new Set<number>();

    const walk = (parentId: number | null, depth: number): void => {
        for (const task of buckets.get(parentId) ?? []) {
            if (seen.has(task.id)) {
                continue;
            }

            seen.add(task.id);

            const children = (buckets.get(task.id) ?? []).map(
                (child) => child.id,
            );

            rows.push({
                task,
                depth,
                hasChildren: children.length > 0,
                collapsed: collapsed.has(task.id),
                children,
            });

            if (!collapsed.has(task.id)) {
                walk(task.id, depth + 1);
            }
        }
    };

    walk(null, 0);

    return rows;
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

export function buildTimeline(
    tasks: Task[],
    zoom: ZoomLevel,
    today: string,
): Timeline {
    const { dayWidth } = ZOOM_CONFIG[zoom];

    const starts = tasks.map((task) => parseDate(task.start_date).getTime());
    const ends = tasks.map((task) => parseDate(task.end_date).getTime());

    const from =
        starts.length > 0
            ? mondayOf(new Date(Math.min(...starts)))
            : mondayOf(parseDate(today));

    const to =
        ends.length > 0
            ? sundayOf(new Date(Math.max(...ends)))
            : addDays(mondayOf(parseDate(today)), 27);

    const days: TimelineDay[] = [];
    const index: Record<string, number> = {};
    const todayTime = parseDate(today).getTime();

    let cursor = from;
    let position = 0;

    while (cursor.getTime() <= to.getTime()) {
        const key = toIso(cursor);
        const weekday = cursor.getUTCDay();

        index[key] = position;
        days.push({
            date: key,
            day: cursor.getUTCDate(),
            month: cursor.getUTCMonth(),
            year: cursor.getUTCFullYear(),
            weekday,
            isWeekend: weekday === 0 || weekday === 6,
            isToday: cursor.getTime() === todayTime,
        });

        cursor = addDays(cursor, 1);
        position++;
    }

    const months: TimelineTierCell[] = [];
    const ticks: TimelineTierCell[] = [];

    for (let i = 0; i < days.length; i++) {
        const day = days[i];
        const monthKey = `${day.year}-${day.month}`;
        const last = months[months.length - 1];

        if (last !== undefined && last.key === monthKey) {
            last.span += 1;
        } else {
            months.push({
                key: monthKey,
                label: `${MONTH_LONG[day.month]} ${day.year}`,
                span: 1,
                offset: i,
            });
        }

        const tickKey = tickKeyFor(day, zoom, i);
        const lastTick = ticks[ticks.length - 1];

        if (lastTick !== undefined && lastTick.key === tickKey) {
            lastTick.span += 1;
        } else {
            ticks.push({
                key: tickKey,
                label: tickLabelFor(day, zoom),
                span: 1,
                offset: i,
            });
        }
    }

    const todayIndex = index[today];

    return {
        zoom,
        dayWidth,
        start: toIso(from),
        end: toIso(to),
        days,
        index,
        months,
        ticks,
        width: days.length * dayWidth,
        todayOffset:
            todayIndex === undefined
                ? null
                : todayIndex * dayWidth + dayWidth / 2,
    };
}

function tickKeyFor(
    day: TimelineDay,
    zoom: ZoomLevel,
    position: number,
): string {
    if (zoom === 'day') {
        return day.date;
    }

    if (zoom === 'week') {
        // Group Monday-to-Sunday by the Monday that starts the week.
        return `${day.year}-${day.month}-${Math.floor(position / 7)}`;
    }

    return `${day.year}-${day.month}`;
}

function tickLabelFor(day: TimelineDay, zoom: ZoomLevel): string {
    if (zoom === 'day') {
        return `${DAY_SHORT[day.weekday]} ${day.day}`;
    }

    if (zoom === 'week') {
        return `${day.day} ${MONTH_SHORT[day.month]}`;
    }

    return MONTH_SHORT[day.month];
}

/* ------------------------------------------------------------------ */
/* Bars and connectors                                                 */
/* ------------------------------------------------------------------ */

export interface BarGeometry {
    left: number;
    width: number;
    centerX: number;
    right: number;
    isMilestone: boolean;
}

export function offsetFor(timeline: Timeline, value: string): number {
    const index = timeline.index[value];

    if (index !== undefined) {
        return index * timeline.dayWidth;
    }

    // Out-of-range dates (a live drag preview) clamp to the nearest edge so the
    // bar never escapes the timeline panel.
    return value < timeline.start ? 0 : timeline.width;
}

export function barGeometry(task: Task, timeline: Timeline): BarGeometry {
    const { dayWidth } = timeline;

    if (task.task_type === 'milestone') {
        const center = offsetFor(timeline, task.start_date) + dayWidth / 2;

        return {
            left: center - MILESTONE_SIZE / 2,
            width: MILESTONE_SIZE,
            centerX: center,
            right: center + MILESTONE_SIZE / 2,
            isMilestone: true,
        };
    }

    const left = offsetFor(timeline, task.start_date);
    const right = offsetFor(timeline, task.end_date) + dayWidth;

    return {
        left,
        width: Math.max(MIN_BAR_WIDTH, right - left),
        centerX: (left + right) / 2,
        right,
        isMilestone: false,
    };
}

export interface ConnectorEnds {
    exit: 'left' | 'right';
    enter: 'left' | 'right';
}

export function connectorEnds(type: DependencyType): ConnectorEnds {
    switch (type) {
        case 'SS':
            return { exit: 'left', enter: 'left' };
        case 'FF':
            return { exit: 'right', enter: 'right' };
        case 'SF':
            return { exit: 'left', enter: 'right' };
        default:
            return { exit: 'right', enter: 'left' };
    }
}

/**
 * An orthogonal elbow from the predecessor to the successor, the same shape
 * Microsoft Project and DHTMLX Gantt draw: a short stub out of the source,
 * across at a clear lane between two rows, then into the target.
 *
 * `midY` is supplied by the caller so it can be snapped to a row boundary —
 * running the long horizontal through the middle of a row would put it straight
 * through an unrelated bar.
 */
export function connectorPath(
    from: { x: number; y: number },
    startX: number,
    endX: number,
    to: { x: number; y: number },
    midY: number,
): string {
    return [
        `M ${round(from.x)} ${round(from.y)}`,
        `L ${round(startX)} ${round(from.y)}`,
        `L ${round(startX)} ${round(midY)}`,
        `L ${round(endX)} ${round(midY)}`,
        `L ${round(endX)} ${round(to.y)}`,
        `L ${round(to.x)} ${round(to.y)}`,
    ].join(' ');
}

/**
 * A vertical lane for a connector that avoids the bars in between.
 *
 * Both vertical runs of an elbow pass through every row separating the two
 * tasks, so the lane is walked outwards from the anchor until it lands in a
 * clear gutter.
 *
 * @param blocks Horizontal spans of the bars between the two rows.
 */
export function clearLane(
    anchor: number,
    direction: 1 | -1,
    blocks: { left: number; right: number }[],
    gap = 16,
    reach = 200,
): number | null {
    for (let offset = gap; offset <= reach; offset += gap) {
        const x = anchor + direction * offset;

        if (x < 0) {
            continue;
        }

        if (
            blocks.every((block) => x <= block.left - 6 || x >= block.right + 6)
        ) {
            return x;
        }
    }

    return null;
}

export interface ExitLane {
    edge: 'left' | 'right';
    attach: number;
    x: number;
}

/**
 * The vertical lane leaving a bar.
 *
 * Normally the arrow leaves from the finish (or start, for SF) side of the
 * predecessor. When the rows in between are filled right up to that edge the
 * link leaves from the opposite side instead — a short clean elbow beats a
 * long detour, and it still lands exactly where it should.
 */
export function clearExit(
    bar: { left: number; right: number },
    exit: 'left' | 'right',
    blocks: { left: number; right: number }[],
): ExitLane {
    const alternate: 'left' | 'right' = exit === 'right' ? 'left' : 'right';

    for (const edge of [exit, alternate]) {
        const attach = edge === 'right' ? bar.right : bar.left;
        const direction = edge === 'right' ? 1 : -1;
        const x = clearLane(attach, direction, blocks);

        if (x !== null) {
            return { edge, attach, x };
        }
    }

    const attach = exit === 'right' ? bar.right : bar.left;
    const direction = exit === 'right' ? 1 : -1;

    return { edge: exit, attach, x: attach + direction * 16 };
}

/**
 * The horizontal lane halfway between two rows, snapped onto a gutter.
 *
 * `period` is the row pitch and `offset` the position of the first gutter —
 * row 0 starts at 0 in the Gantt grid, while the network diagram indents its
 * nodes by a padding border.
 */
export function laneBetweenRows(
    fromY: number,
    toY: number,
    period: number,
    offset = 0,
): number {
    return Math.round(((fromY + toY) / 2 - offset) / period) * period + offset;
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

export function formatDependency(task: Task): string {
    if (
        task.predecessor_wbs_code === null ||
        task.predecessor_wbs_code === undefined
    ) {
        return '—';
    }

    const lag =
        task.lag_days === 0
            ? ''
            : task.lag_days > 0
              ? `+${task.lag_days}d`
              : `${task.lag_days}d`;

    return `${task.predecessor_wbs_code}${task.dependency_type}${lag}`;
}

export function shiftDateByPixels(
    timeline: Timeline,
    value: string,
    deltaPx: number,
): string {
    const moved = Math.round(deltaPx / timeline.dayWidth);

    return toIso(snapToWorkingDay(addDays(parseDate(value), moved)));
}

export function resizeDurationByPixels(
    timeline: Timeline,
    duration: number,
    deltaPx: number,
): number {
    const moved = Math.round(deltaPx / timeline.dayWidth);

    return Math.max(1, duration + moved);
}

export function capitalize(value: string): string {
    return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

/**
 * Calendar days the schedule spans, used to pick a zoom that fits the screen.
 */
export function calendarSpan(tasks: Task[]): number {
    if (tasks.length === 0) {
        return 0;
    }

    const starts = tasks.map((task) => parseDate(task.start_date).getTime());
    const ends = tasks.map((task) => parseDate(task.end_date).getTime());

    return (
        Math.round((Math.max(...ends) - Math.min(...starts)) / 86_400_000) + 1
    );
}

/**
 * Duration-weighted completion of the activities that carry work.
 */
export function overallProgress(tasks: Task[]): number {
    const activities = tasks.filter((task) => task.task_type !== 'summary');

    if (activities.length === 0) {
        return 0;
    }

    const weight = activities.reduce(
        (total, task) => total + Math.max(1, task.duration_days),
        0,
    );

    const done = activities.reduce(
        (total, task) =>
            total + Math.max(1, task.duration_days) * task.progress,
        0,
    );

    return Math.round(done / weight);
}
