import type { PageProps } from '@inertiajs/core';
import { Head, router, usePage } from '@inertiajs/react';
import {
    CalendarCheck,
    Crosshair,
    Expand,
    Flag,
    Info,
    Layers,
    Maximize2,
    Minimize2,
    Network,
    Plus,
    Route,
    Shrink,
    Target,
    TrendingUp,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import AboutModal from '@/components/AboutModal';
import GanttChart from '@/components/GanttChart';
import Modal from '@/components/Modal';
import NetworkDiagram from '@/components/NetworkDiagram';
import TaskFormModal from '@/components/TaskFormModal';
import {
    calendarSpan,
    formatLongDate,
    LEFT_PANEL_WIDTH,
    overallProgress,
    todayIso,
    ZOOM_CONFIG,
} from '@/lib/gantt';
import { cn } from '@/lib/utils';
import { destroy, schedule, store, update } from '@/routes/tasks';
import type {
    GanttFlowPageProps,
    Task,
    TaskPayload,
    ViewMode,
    ZoomLevel,
} from '@/types/gantt';

const ZOOM_LEVELS: ZoomLevel[] = ['day', 'week', 'month'];
const VIEWS: { value: ViewMode; label: string; icon: typeof Route }[] = [
    { value: 'gantt', label: 'Split View', icon: Route },
    { value: 'network', label: 'Diagram Jaringan', icon: Network },
];

const PANEL = 'rounded-md border border-gray-200 bg-white';
const BTN_PRIMARY =
    'inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60';
const BTN_SECONDARY =
    'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60';

export default function Index() {
    const { tasks, analysis, options, flash } = usePage<
        PageProps & GanttFlowPageProps
    >().props;
    const { errors } = usePage().props;

    const [view, setView] = useState<ViewMode>('gantt');
    const [zoom, setZoom] = useState<ZoomLevel>('day');
    const [showCritical, setShowCritical] = useState(false);
    const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(
        () => new Set<number>(),
    );
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Task | null>(null);
    const [aboutOpen, setAboutOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
    const [processing, setProcessing] = useState(false);
    const [focus, setFocus] = useState<{
        date: string;
        nonce: number;
    } | null>(null);

    const chartBoxRef = useRef<HTMLDivElement | null>(null);

    const stats = useMemo(() => {
        const activities = tasks.filter((task) => task.task_type !== 'summary');
        const phases = tasks.filter((task) => task.task_type === 'summary');
        const milestones = tasks.filter(
            (task) => task.task_type === 'milestone',
        );

        return {
            total: tasks.length,
            activities: activities.length,
            phases: phases.length,
            milestones: milestones.length,
            critical: analysis.critical_path_ids.length,
            progress: overallProgress(tasks),
        };
    }, [tasks, analysis]);

    const runTask = useCallback(
        (
            action: 'store' | 'update' | 'delete' | 'schedule',
            payload:
                | TaskPayload
                | { start_date: string; duration_days: number }
                | undefined,
            task?: Task,
        ): void => {
            setProcessing(true);

            const done = {
                preserveScroll: true,
                onSuccess: () => {
                    setFormOpen(false);
                    setEditing(null);
                    setPendingDelete(null);
                },
                onFinish: () => setProcessing(false),
            };

            if (action === 'store') {
                router.post(store().url, payload ?? {}, done);
                return;
            }

            if (task === undefined) {
                setProcessing(false);
                return;
            }

            if (action === 'update') {
                router.put(update(task.id).url, payload ?? {}, done);
                return;
            }

            if (action === 'schedule') {
                router.patch(schedule(task.id).url, payload ?? {}, done);
                return;
            }

            router.delete(destroy(task.id).url, {
                preserveScroll: true,
                onSuccess: () => setPendingDelete(null),
                onFinish: () => setProcessing(false),
            });
        },
        [],
    );

    const payloadFor = (
        task: Task,
        overrides: Partial<TaskPayload> = {},
    ): TaskPayload => ({
        name: task.name,
        task_type: task.task_type,
        start_date: task.start_date,
        duration_days: task.duration_days,
        progress: task.progress,
        priority: task.priority,
        parent_id: task.parent_id,
        predecessor_id: task.predecessor_id,
        dependency_type: task.dependency_type,
        lag_days: task.lag_days,
        resource_names: task.resource_names,
        ...overrides,
    });

    const openCreate = (): void => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (task: Task): void => {
        setEditing(task);
        setFormOpen(true);
    };

    const toggleCollapse = (task: Task): void => {
        setCollapsed((current) => {
            const next = new Set(current);

            if (next.has(task.id)) {
                next.delete(task.id);
            } else {
                next.add(task.id);
            }

            return next;
        });
    };

    const summarizeAll = (collapse: boolean): void => {
        if (!collapse) {
            setCollapsed(new Set<number>());
            return;
        }

        const parents = new Set(
            tasks
                .map((task) => task.parent_id)
                .filter((id): id is number => id !== null),
        );

        setCollapsed(parents);
    };

    const goToToday = (): void => {
        setFocus({ date: todayIso(), nonce: Date.now() });
    };

    const fitToScreen = (): void => {
        const width = chartBoxRef.current?.clientWidth ?? 0;
        const span = calendarSpan(tasks);

        if (width === 0 || span === 0) {
            return;
        }

        const available = Math.max(160, width - LEFT_PANEL_WIDTH - 2);
        const perDay = available / span;

        if (perDay >= ZOOM_CONFIG.day.dayWidth) {
            setZoom('day');
        } else if (perDay >= ZOOM_CONFIG.week.dayWidth) {
            setZoom('week');
        } else {
            setZoom('month');
        }
    };

    return (
        <>
            <Head title="GanttFlow · Penjadwalan Proyek" />

            <div className="min-h-screen bg-gray-50">
                <header className="border-b border-gray-200 bg-white">
                    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <span className="flex size-8 items-center justify-center rounded-md bg-blue-600 text-white">
                                <Route size={17} />
                            </span>
                            <div>
                                <h1 className="text-sm font-semibold text-gray-900">
                                    GanttFlow
                                </h1>
                                <p className="text-[11px] text-gray-500">
                                    Penjadwalan Proyek Pengembangan Sistem
                                    Kelola Pemberkasan
                                </p>
                            </div>
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            {flash?.success ? (
                                <span className="hidden items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 ring-inset sm:inline-flex">
                                    <CalendarCheck size={13} />
                                    {flash.success}
                                </span>
                            ) : null}

                            <button
                                type="button"
                                onClick={() => setAboutOpen(true)}
                                aria-label="Tentang sistem"
                                className={BTN_SECONDARY}
                            >
                                <Info size={13} />
                                Tentang
                            </button>

                            <button
                                type="button"
                                onClick={openCreate}
                                className={BTN_PRIMARY}
                            >
                                <Plus size={15} />
                                Tambah Tugas
                            </button>
                        </div>
                    </div>
                </header>

                <main className="mx-auto max-w-[1600px] space-y-3 px-4 py-4">
                    <StatRow stats={stats} analysis={analysis} />

                    <div
                        className={cn(
                            PANEL,
                            'flex flex-wrap items-center gap-2 p-2',
                        )}
                    >
                        <Segmented
                            items={VIEWS.map((item) => ({
                                key: item.value,
                                label: item.label,
                                icon: item.icon,
                            }))}
                            value={view}
                            onChange={(next) => setView(next as ViewMode)}
                        />

                        <Divider />

                        <Segmented
                            items={ZOOM_LEVELS.map((level) => ({
                                key: level,
                                label: ZOOM_CONFIG[level].label,
                            }))}
                            value={zoom}
                            onChange={(next) => setZoom(next as ZoomLevel)}
                        />

                        <Divider />

                        <button
                            type="button"
                            onClick={() => setShowCritical((value) => !value)}
                            aria-pressed={showCritical}
                            className={cn(
                                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium',
                                showCritical
                                    ? 'border-red-300 bg-red-50 text-red-700'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                            )}
                        >
                            <Target size={13} />
                            Jalur Kritis
                        </button>

                        <div className="ml-auto flex items-center gap-2">
                            <button
                                type="button"
                                onClick={goToToday}
                                className={BTN_SECONDARY}
                            >
                                <Crosshair size={13} />
                                Go to Today
                            </button>
                            <button
                                type="button"
                                onClick={fitToScreen}
                                disabled={view !== 'gantt'}
                                className={BTN_SECONDARY}
                            >
                                <Maximize2 size={13} />
                                Fit to Screen
                            </button>
                            <button
                                type="button"
                                onClick={() => summarizeAll(false)}
                                disabled={view !== 'gantt'}
                                className={BTN_SECONDARY}
                            >
                                <Expand size={13} />
                                Expand All
                            </button>
                            <button
                                type="button"
                                onClick={() => summarizeAll(true)}
                                disabled={view !== 'gantt'}
                                className={BTN_SECONDARY}
                            >
                                <Shrink size={13} />
                                Collapse All
                            </button>
                        </div>
                    </div>

                    {showCritical && analysis.critical_path_names.length > 0 ? (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                            <span className="font-semibold">
                                Jalur kritis ({stats.critical} aktivitas, slack
                                0):
                            </span>{' '}
                            {analysis.critical_path_names.join(' → ')}
                        </div>
                    ) : null}

                    <div ref={chartBoxRef} className="overflow-x-auto">
                        <div className="min-w-[1000px]">
                            {view === 'gantt' ? (
                                <GanttChart
                                    tasks={tasks}
                                    analysis={analysis}
                                    zoom={zoom}
                                    showCritical={showCritical}
                                    collapsed={collapsed}
                                    focus={focus}
                                    onToggleCollapse={toggleCollapse}
                                    onEdit={openEdit}
                                    onRename={(task, name) =>
                                        runTask(
                                            'update',
                                            payloadFor(task, { name }),
                                            task,
                                        )
                                    }
                                    onReschedule={(task, start, duration) =>
                                        runTask(
                                            'schedule',
                                            {
                                                start_date: start,
                                                duration_days: duration,
                                            },
                                            task,
                                        )
                                    }
                                />
                            ) : (
                                <NetworkDiagram
                                    tasks={tasks}
                                    analysis={analysis}
                                    showCritical={showCritical}
                                    onSelect={openEdit}
                                />
                            )}
                        </div>
                    </div>

                    <p className="px-1 text-[11px] text-gray-500">
                        Geser balok untuk memindahkan jadwal, tarik ujung kanan
                        untuk mengubah durasi, dan klik ganda nama tugas untuk
                        mengganti nama. Semua perubahan langsung tersimpan ke
                        basis data.
                    </p>
                </main>
            </div>

            <TaskFormModal
                open={formOpen}
                task={editing}
                tasks={tasks}
                options={options}
                processing={processing}
                errors={errors}
                onClose={() => {
                    setFormOpen(false);
                    setEditing(null);
                }}
                onDelete={(task) => {
                    setFormOpen(false);
                    setPendingDelete(task);
                }}
                onSubmit={(payload) =>
                    runTask(
                        editing === null ? 'store' : 'update',
                        payload,
                        editing ?? undefined,
                    )
                }
            />

            <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

            <Modal
                open={pendingDelete !== null}
                onClose={() => setPendingDelete(null)}
                title="Hapus Tugas"
                description="Tindakan ini tidak dapat dibatalkan."
                size="md"
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => setPendingDelete(null)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            disabled={processing}
                            onClick={() => {
                                if (pendingDelete !== null) {
                                    runTask('delete', undefined, pendingDelete);
                                }
                            }}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                            Hapus
                        </button>
                    </>
                }
            >
                <p className="text-sm text-gray-600">
                    Hapus{' '}
                    <span className="font-medium text-gray-900">
                        {pendingDelete?.wbs_code} {pendingDelete?.name}
                    </span>
                    ? Sub-tugas yang berada di bawahnya akan kehilangan
                    induknya.
                </p>
            </Modal>
        </>
    );
}

function StatRow({
    stats,
    analysis,
}: {
    stats: {
        total: number;
        activities: number;
        phases: number;
        milestones: number;
        critical: number;
        progress: number;
    };
    analysis: GanttFlowPageProps['analysis'];
}) {
    const cards = [
        {
            label: 'Total Baris',
            value: String(stats.total),
            hint: `${stats.phases} fase · ${stats.activities} aktivitas`,
            icon: Layers,
        },
        {
            label: 'Milestone',
            value: String(stats.milestones),
            hint: 'penanda pencapaian',
            icon: Flag,
        },
        {
            label: 'Aktivitas Kritis',
            value: String(stats.critical),
            hint: 'slack = 0 hari',
            icon: Target,
        },
        {
            label: 'Progres Proyek',
            value: `${stats.progress}%`,
            hint: 'berbobot durasi',
            icon: TrendingUp,
        },
        {
            label: 'Durasi Proyek',
            value: `${analysis.project_duration_days}d`,
            hint: 'hari kerja (CPM)',
            icon: Flag,
        },
        {
            label: 'Rentang Jadwal',
            value: `${analysis.project_start === null ? '—' : analysis.project_start.slice(5)}`,
            hint: `s.d. ${formatLongDate(analysis.project_end)}`,
            icon: Minimize2,
        },
    ];

    return (
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {cards.map((card) => (
                <div
                    key={card.label}
                    className={cn(PANEL, 'flex items-center gap-2.5 px-3 py-2')}
                >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                        <card.icon size={15} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[10px] tracking-wide text-gray-500 uppercase">
                            {card.label}
                        </p>
                        <p className="truncate text-sm font-semibold text-gray-900">
                            {card.value}
                        </p>
                        <p className="truncate text-[10px] text-gray-400">
                            {card.hint}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function Segmented({
    items,
    value,
    onChange,
}: {
    items: { key: string; label: string; icon?: typeof Route }[];
    value: string;
    onChange: (next: string) => void;
}) {
    return (
        <div className="inline-flex rounded-md border border-gray-300 bg-gray-100 p-0.5">
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    onClick={() => onChange(item.key)}
                    aria-pressed={value === item.key}
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium',
                        value === item.key
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900',
                    )}
                >
                    {item.icon ? <item.icon size={13} /> : null}
                    {item.label}
                </button>
            ))}
        </div>
    );
}

function Divider() {
    return <span className="h-5 w-px bg-gray-200" />;
}
