import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    barGeometry,
    buildTimeline,
    clearExit,
    clearLane,
    connectorEnds,
    connectorPath,
    finishDate,
    flattenTree,
    formatDependency,
    laneBetweenRows,
    LEFT_PANEL_WIDTH,
    parseDate,
    resizeDurationByPixels,
    ROW_HEIGHT,
    shiftDateByPixels,
    toIso,
    todayIso,
} from '@/lib/gantt';
import { cn } from '@/lib/utils';
import type { ProjectAnalysis, Task, ZoomLevel } from '@/types/gantt';

const HEADER_TIER_HEIGHT = 28;
const HEADER_HEIGHT = HEADER_TIER_HEIGHT * 2;
const GRID_COLUMNS =
    'grid grid-cols-[64px_minmax(140px,1fr)_62px_88px_88px_76px_52px_140px] items-center';

interface GanttChartProps {
    tasks: Task[];
    analysis: ProjectAnalysis;
    zoom: ZoomLevel;
    showCritical: boolean;
    collapsed: ReadonlySet<number>;
    onToggleCollapse: (task: Task) => void;
    onEdit: (task: Task) => void;
    onRename: (task: Task, name: string) => void;
    onReschedule: (task: Task, start: string, duration: number) => void;
    focus: { date: string; nonce: number } | null;
}

interface DragState {
    taskId: number;
    mode: 'move' | 'resize';
    startX: number;
    originStart: string;
    originDuration: number;
    deltaX: number;
}

export default function GanttChart({
    tasks,
    analysis,
    zoom,
    showCritical,
    collapsed,
    onToggleCollapse,
    onEdit,
    onRename,
    onReschedule,
    focus,
}: GanttChartProps) {
    const today = useMemo(() => todayIso(), []);
    const timeline = useMemo(
        () => buildTimeline(tasks, zoom, today),
        [tasks, zoom, today],
    );
    const rows = useMemo(
        () => flattenTree(tasks, collapsed),
        [tasks, collapsed],
    );

    const [drag, setDrag] = useState<DragState | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);

    const updateDrag = useCallback((next: DragState | null): void => {
        dragRef.current = next;
        setDrag(next);
    }, []);

    const gridRef = useRef<HTMLDivElement | null>(null);
    const headerRef = useRef<HTMLDivElement | null>(null);
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const syncing = useRef(false);

    const rowIndex = useMemo(() => {
        const map = new Map<number, number>();
        rows.forEach((row, index) => map.set(row.task.id, index));

        return map;
    }, [rows]);

    const preview = useMemo(() => {
        if (drag === null) {
            return null;
        }

        if (drag.mode === 'move') {
            const start = shiftDateByPixels(
                timeline,
                drag.originStart,
                drag.deltaX,
            );

            return {
                id: drag.taskId,
                start_date: start,
                end_date: toIso(
                    finishDate(parseDate(start), drag.originDuration),
                ),
                duration_days: drag.originDuration,
            };
        }

        const duration = resizeDurationByPixels(
            timeline,
            drag.originDuration,
            drag.deltaX,
        );

        return {
            id: drag.taskId,
            start_date: drag.originStart,
            end_date: toIso(finishDate(parseDate(drag.originStart), duration)),
            duration_days: duration,
        };
    }, [drag, timeline]);

    const bars = useMemo(() => {
        const map = new Map<number, ReturnType<typeof barGeometry>>();

        for (const row of rows) {
            const task =
                preview !== null && preview.id === row.task.id
                    ? { ...row.task, ...preview }
                    : row.task;

            map.set(row.task.id, barGeometry(task, timeline));
        }

        return map;
    }, [rows, timeline, preview]);

    const connectors = useMemo(() => {
        const paths: { key: number; d: string }[] = [];

        for (const row of rows) {
            const task = row.task;

            if (task.predecessor_id === null) {
                continue;
            }

            const fromIndex = rowIndex.get(task.predecessor_id);
            const toIndex = rowIndex.get(task.id);

            if (fromIndex === undefined || toIndex === undefined) {
                continue;
            }

            const from = bars.get(task.predecessor_id);
            const to = bars.get(task.id);

            if (from === undefined || to === undefined) {
                continue;
            }

            const ends = connectorEnds(task.dependency_type);
            const toX = ends.enter === 'left' ? to.left - 4 : to.right + 4;
            const fromY = fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
            const toY = toIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

            // Bars sitting between the two rows are the only obstacles the
            // two vertical runs can meet.
            const blocks: { left: number; right: number }[] = [];
            const low = Math.min(fromIndex, toIndex);
            const high = Math.max(fromIndex, toIndex);

            for (let index = low + 1; index < high; index++) {
                const between = rows[index]?.task;
                const geometry =
                    between === undefined ? undefined : bars.get(between.id);

                if (geometry !== undefined) {
                    blocks.push(geometry);
                }
            }

            const exit = clearExit(from, ends.exit, blocks);
            const enterX =
                clearLane(toX, ends.enter === 'left' ? -1 : 1, blocks) ??
                toX + (ends.enter === 'left' ? -16 : 16);

            paths.push({
                key: task.id,
                d: connectorPath(
                    { x: exit.attach, y: fromY },
                    exit.x,
                    enterX,
                    { x: toX, y: toY },
                    laneBetweenRows(fromY, toY, ROW_HEIGHT),
                ),
            });
        }

        return paths;
    }, [rows, rowIndex, bars]);

    const syncScroll = useCallback(
        (source: 'grid' | 'header' | 'body'): void => {
            if (syncing.current) {
                return;
            }

            syncing.current = true;

            const grid = gridRef.current;
            const header = headerRef.current;
            const body = bodyRef.current;

            if (grid !== null && body !== null) {
                if (source === 'grid') {
                    body.scrollTop = grid.scrollTop;
                } else {
                    grid.scrollTop = body.scrollTop;
                }
            }

            if (header !== null && body !== null) {
                if (source === 'header') {
                    body.scrollLeft = header.scrollLeft;
                } else {
                    header.scrollLeft = body.scrollLeft;
                }
            }

            requestAnimationFrame(() => {
                syncing.current = false;
            });
        },
        [],
    );

    // "Go to Today" recentres the timeline on the requested date.
    useEffect(() => {
        if (focus === null) {
            return;
        }

        const body = bodyRef.current;
        const offset = timeline.index[focus.date];

        if (body === null || offset === undefined) {
            return;
        }

        body.scrollLeft = Math.max(
            0,
            offset * timeline.dayWidth +
                timeline.dayWidth / 2 -
                body.clientWidth / 2,
        );
        syncScroll('body');
    }, [focus, timeline, syncScroll]);

    const beginDrag = useCallback(
        (task: Task, mode: 'move' | 'resize', event: React.PointerEvent) => {
            if (task.task_type === 'summary') {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            (event.target as HTMLElement).setPointerCapture(event.pointerId);

            updateDrag({
                taskId: task.id,
                mode,
                startX: event.clientX,
                originStart: task.start_date,
                originDuration: task.duration_days,
                deltaX: 0,
            });
        },
        [updateDrag],
    );

    const moveDrag = useCallback(
        (event: React.PointerEvent) => {
            const current = dragRef.current;

            if (current === null) {
                return;
            }

            updateDrag({
                ...current,
                deltaX: event.clientX - current.startX,
            });
        },
        [updateDrag],
    );

    const endDrag = useCallback(
        (event: React.PointerEvent) => {
            const target = event.target as HTMLElement;

            if (target.hasPointerCapture(event.pointerId)) {
                target.releasePointerCapture(event.pointerId);
            }

            const current = dragRef.current;
            updateDrag(null);

            if (current === null || Math.round(current.deltaX) === 0) {
                return;
            }

            const task = rows.find(
                (row) => row.task.id === current.taskId,
            )?.task;

            if (task !== undefined) {
                if (current.mode === 'move') {
                    const start = shiftDateByPixels(
                        timeline,
                        current.originStart,
                        current.deltaX,
                    );

                    if (start !== task.start_date) {
                        onReschedule(task, start, task.duration_days);
                    }
                } else {
                    const duration = resizeDurationByPixels(
                        timeline,
                        current.originDuration,
                        current.deltaX,
                    );

                    if (duration !== task.duration_days) {
                        onReschedule(task, task.start_date, duration);
                    }
                }
            }
        },
        [onReschedule, rows, timeline, updateDrag],
    );

    const canvasBackground = useMemo(() => {
        const width = timeline.dayWidth;
        const lineWidth = 1;

        // Weekends repeat every seven days because the timeline always starts
        // on a Monday, so a single repeating gradient shades them all.
        const weekend = `repeating-linear-gradient(to right, transparent 0px, transparent ${
            width * 5
        }px, rgb(241 245 249) ${width * 5}px, rgb(241 245 249) ${width * 7}px)`;

        const gridStep = timeline.zoom === 'day' ? width : width * 7;
        const vertical = `repeating-linear-gradient(to right, rgb(229 231 235) 0px, rgb(229 231 235) ${lineWidth}px, transparent ${lineWidth}px, transparent ${gridStep}px)`;

        const horizontal = `repeating-linear-gradient(to bottom, rgb(229 231 235) 0px, rgb(229 231 235) ${lineWidth}px, transparent ${lineWidth}px, transparent ${ROW_HEIGHT}px)`;

        return { backgroundImage: `${horizontal}, ${vertical}, ${weekend}` };
    }, [timeline.dayWidth, timeline.zoom]);

    const isCriticalTask = (task: Task): boolean =>
        analysis.nodes[String(task.id)]?.is_critical === true;

    return (
        <div
            data-testid="gantt-split"
            className="flex h-[68vh] min-h-[440px] overflow-hidden rounded-md border border-gray-200 bg-white"
        >
            {/* Left panel: WBS spreadsheet */}
            <div
                data-testid="gantt-grid-panel"
                className="flex shrink-0 flex-col border-r border-gray-200"
                style={{ width: LEFT_PANEL_WIDTH }}
            >
                <div
                    ref={gridRef}
                    data-testid="gantt-grid"
                    onScroll={() => syncScroll('grid')}
                    className="flex-1 overflow-x-hidden overflow-y-auto"
                >
                    {/* Sticky inside the scroller so the grid columns can never
                        drift out of alignment with the rows. */}
                    <div
                        className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 text-[11px] font-semibold tracking-wide text-gray-500 uppercase"
                        style={{ height: HEADER_HEIGHT }}
                    >
                        <div className={cn(GRID_COLUMNS, 'h-full')}>
                            <Cell>WBS</Cell>
                            <Cell>Nama Tugas</Cell>
                            <Cell className="justify-end">Durasi</Cell>
                            <Cell>Mulai</Cell>
                            <Cell>Selesai</Cell>
                            <Cell>Dep.</Cell>
                            <Cell className="justify-end">%</Cell>
                            <Cell>Resources</Cell>
                        </div>
                    </div>

                    {rows.length === 0 ? (
                        <EmptyState />
                    ) : (
                        rows.map((row) => {
                            const task = row.task;
                            const critical =
                                showCritical && isCriticalTask(task);

                            return (
                                <div
                                    key={task.id}
                                    data-testid="gantt-row"
                                    data-task-id={task.id}
                                    data-wbs={task.wbs_code}
                                    data-type={task.task_type}
                                    style={{ height: ROW_HEIGHT }}
                                    className={cn(
                                        GRID_COLUMNS,
                                        'border-b border-gray-100 text-xs text-gray-700',
                                        task.task_type === 'summary' &&
                                            'bg-gray-50 font-semibold text-gray-900',
                                        task.task_type === 'milestone' &&
                                            'bg-amber-50/40',
                                        critical && 'bg-red-50',
                                    )}
                                >
                                    <div className="px-2 font-mono text-[11px] text-gray-500">
                                        {task.wbs_code}
                                    </div>

                                    <div className="flex min-w-0 items-center gap-1 pr-2">
                                        <Indent depth={row.depth} />
                                        {row.hasChildren ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onToggleCollapse(task)
                                                }
                                                aria-label={
                                                    row.collapsed
                                                        ? 'Perluas sub-tugas'
                                                        : 'Ciutkan sub-tugas'
                                                }
                                                className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-200"
                                            >
                                                {row.collapsed ? (
                                                    <ChevronRight size={13} />
                                                ) : (
                                                    <ChevronDown size={13} />
                                                )}
                                            </button>
                                        ) : (
                                            <span className="w-[18px] shrink-0" />
                                        )}

                                        <TaskName
                                            task={task}
                                            editing={editingId === task.id}
                                            onStartEdit={() =>
                                                setEditingId(task.id)
                                            }
                                            onCommit={(name) => {
                                                setEditingId(null);

                                                if (
                                                    name.trim() !== '' &&
                                                    name !== task.name
                                                ) {
                                                    onRename(task, name.trim());
                                                }
                                            }}
                                        />
                                    </div>

                                    <div className="px-2 text-right font-mono text-[11px] text-gray-600">
                                        {task.duration_days}d
                                    </div>
                                    <div className="px-2 font-mono text-[11px] text-gray-600">
                                        {task.start_date}
                                    </div>
                                    <div className="px-2 font-mono text-[11px] text-gray-600">
                                        {task.end_date}
                                    </div>
                                    <div className="px-2 font-mono text-[11px] text-gray-500">
                                        {formatDependency(task)}
                                    </div>
                                    <div className="px-2 text-right">
                                        <span className="font-mono text-[11px] text-gray-700">
                                            {task.progress}%
                                        </span>
                                    </div>
                                    <div className="flex min-w-0 items-center gap-1 pr-2">
                                        <span className="truncate text-[11px] text-gray-500">
                                            {task.resource_names ?? '—'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onEdit(task)}
                                            aria-label="Ubah tugas"
                                            className="ml-auto shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right panel: timeline */}
            <div className="flex min-w-0 flex-1 flex-col">
                <div
                    ref={headerRef}
                    data-testid="gantt-header"
                    onScroll={() => syncScroll('header')}
                    className="shrink-0 overflow-x-auto overflow-y-hidden border-b border-gray-200 bg-gray-50"
                    style={{ height: HEADER_HEIGHT }}
                >
                    <div
                        className="relative"
                        style={{ width: timeline.width, height: HEADER_HEIGHT }}
                    >
                        {timeline.months.map((month) => (
                            <div
                                key={`m-${month.key}`}
                                className="absolute top-0 flex items-center justify-center border-r border-gray-200 text-[11px] font-semibold text-gray-700"
                                style={{
                                    left: month.offset * timeline.dayWidth,
                                    width: month.span * timeline.dayWidth,
                                    height: HEADER_TIER_HEIGHT,
                                }}
                            >
                                {month.span * timeline.dayWidth > 48
                                    ? month.label
                                    : ''}
                            </div>
                        ))}

                        {timeline.ticks.map((tick) => (
                            <div
                                key={`t-${tick.key}`}
                                data-testid="gantt-tick"
                                data-label={tick.label}
                                className="absolute flex items-center justify-center border-t border-r border-gray-200 text-[10px] text-gray-500"
                                style={{
                                    left: tick.offset * timeline.dayWidth,
                                    width: tick.span * timeline.dayWidth,
                                    top: HEADER_TIER_HEIGHT,
                                    height: HEADER_TIER_HEIGHT,
                                }}
                            >
                                {tick.span * timeline.dayWidth > 30
                                    ? tick.label
                                    : ''}
                            </div>
                        ))}
                    </div>
                </div>

                <div
                    ref={bodyRef}
                    data-testid="gantt-body"
                    onScroll={() => syncScroll('body')}
                    className="flex-1 overflow-auto"
                >
                    <div
                        className="relative"
                        style={{
                            width: timeline.width,
                            height: Math.max(rows.length * ROW_HEIGHT, 1),
                        }}
                    >
                        <div
                            data-testid="gantt-canvas"
                            className="absolute inset-0"
                            style={canvasBackground}
                        />

                        {timeline.todayOffset !== null ? (
                            <div
                                data-testid="gantt-today"
                                className="pointer-events-none absolute top-0 bottom-0 z-30 w-[2px] bg-red-500"
                                style={{ left: timeline.todayOffset }}
                            >
                                <span className="absolute -top-0 -left-[18px] rounded-b bg-red-500 px-1 text-[9px] font-semibold text-white">
                                    Hari ini
                                </span>
                            </div>
                        ) : null}

                        <svg
                            className="pointer-events-none absolute inset-0 z-10"
                            width={timeline.width}
                            height={Math.max(rows.length * ROW_HEIGHT, 1)}
                        >
                            <defs>
                                <marker
                                    id="gantt-arrow"
                                    viewBox="0 0 10 10"
                                    refX="9"
                                    refY="5"
                                    markerWidth="6"
                                    markerHeight="6"
                                    orient="auto-start-reverse"
                                >
                                    <path
                                        d="M 0 0 L 10 5 L 0 10 z"
                                        fill="#64748b"
                                    />
                                </marker>
                            </defs>

                            {connectors.map((connector) => (
                                <path
                                    key={connector.key}
                                    data-testid="gantt-connector"
                                    data-task-id={connector.key}
                                    d={connector.d}
                                    fill="none"
                                    stroke="#94a3b8"
                                    strokeWidth={1.5}
                                    markerEnd="url(#gantt-arrow)"
                                />
                            ))}
                        </svg>

                        {rows.map((row, index) => {
                            const task = row.task;
                            const geometry = bars.get(task.id);

                            if (geometry === undefined) {
                                return null;
                            }

                            const critical =
                                showCritical && isCriticalTask(task);
                            const top =
                                index * ROW_HEIGHT + (ROW_HEIGHT - 18) / 2;
                            const dragging =
                                drag !== null && drag.taskId === task.id;

                            if (task.task_type === 'milestone') {
                                return (
                                    <div
                                        key={task.id}
                                        data-testid="gantt-bar"
                                        data-task-id={task.id}
                                        data-bar-type="milestone"
                                        title={`${task.wbs_code} ${task.name} — ${task.start_date}`}
                                        onPointerDown={(event) =>
                                            beginDrag(task, 'move', event)
                                        }
                                        onPointerMove={moveDrag}
                                        onPointerUp={endDrag}
                                        onDoubleClick={() => onEdit(task)}
                                        className={cn(
                                            'absolute z-20 size-[15px] rotate-45 cursor-grab border active:cursor-grabbing',
                                            critical
                                                ? 'border-red-700 bg-red-500'
                                                : 'border-gray-900 bg-amber-400',
                                            dragging && 'opacity-80',
                                        )}
                                        style={{
                                            left: geometry.centerX - 7.5,
                                            top: index * ROW_HEIGHT + 9,
                                        }}
                                    />
                                );
                            }

                            if (task.task_type === 'summary') {
                                return (
                                    <div
                                        key={task.id}
                                        data-testid="gantt-bar"
                                        data-task-id={task.id}
                                        data-bar-type="summary"
                                        title={`${task.wbs_code} ${task.name} — ${task.start_date} s.d. ${task.end_date}`}
                                        className="absolute z-20"
                                        style={{
                                            left: geometry.left,
                                            top,
                                            width: geometry.width,
                                        }}
                                    >
                                        <div className="h-[7px] bg-gray-800" />
                                        <div className="absolute top-[7px] left-0 h-[6px] w-[2px] bg-gray-800" />
                                        <div className="absolute top-[7px] right-0 h-[6px] w-[2px] bg-gray-800" />
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={task.id}
                                    data-testid="gantt-bar"
                                    data-task-id={task.id}
                                    data-bar-type="regular"
                                    data-progress={task.progress}
                                    title={`${task.wbs_code} ${task.name}\n${task.start_date} s.d. ${task.end_date}\nDurasi ${task.duration_days} hari kerja · ${task.progress}%`}
                                    onPointerDown={(event) =>
                                        beginDrag(task, 'move', event)
                                    }
                                    onPointerMove={moveDrag}
                                    onPointerUp={endDrag}
                                    onDoubleClick={() => onEdit(task)}
                                    className={cn(
                                        'absolute z-20 flex items-center overflow-hidden rounded-sm border',
                                        critical
                                            ? 'border-red-700 bg-red-200'
                                            : 'border-blue-700/60 bg-blue-200',
                                        dragging && 'opacity-80',
                                    )}
                                    style={{
                                        left: geometry.left,
                                        top,
                                        width: geometry.width,
                                        height: 18,
                                        cursor: 'grab',
                                    }}
                                >
                                    <div
                                        className={cn(
                                            'h-full',
                                            critical
                                                ? 'bg-red-500'
                                                : 'bg-blue-500',
                                        )}
                                        style={{ width: `${task.progress}%` }}
                                    />
                                    {geometry.width >= 40 ? (
                                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-900">
                                            {task.progress}%
                                        </span>
                                    ) : null}
                                    <span
                                        data-testid="gantt-resize"
                                        onPointerDown={(event) =>
                                            beginDrag(task, 'resize', event)
                                        }
                                        onPointerMove={moveDrag}
                                        onPointerUp={endDrag}
                                        className="absolute top-0 right-0 h-full w-[6px] cursor-ew-resize bg-gray-900/20 hover:bg-gray-900/40"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Cell({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('flex items-center px-2', className)}>
            {children}
        </div>
    );
}

function Indent({ depth }: { depth: number }) {
    if (depth === 0) {
        return null;
    }

    return <span style={{ width: depth * 14 }} className="shrink-0" />;
}

function TaskName({
    task,
    editing,
    onStartEdit,
    onCommit,
}: {
    task: Task;
    editing: boolean;
    onStartEdit: () => void;
    onCommit: (name: string) => void;
}) {
    const [value, setValue] = useState(task.name);

    if (!editing) {
        return (
            <span
                onDoubleClick={onStartEdit}
                title="Klik ganda untuk mengganti nama"
                className="truncate"
            >
                {task.name}
            </span>
        );
    }

    return (
        <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => onCommit(value)}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.currentTarget.blur();
                }

                if (event.key === 'Escape') {
                    setValue(task.name);
                    onCommit(task.name);
                }
            }}
            className="w-full rounded border border-blue-500 bg-white px-1 py-0.5 text-xs font-normal text-gray-900 outline-none"
        />
    );
}

function EmptyState() {
    return (
        <div className="flex min-h-[220px] items-center justify-center p-8 text-center text-sm text-gray-500">
            Belum ada tugas. Gunakan tombol “Tambah Tugas” untuk memulai jadwal.
        </div>
    );
}
