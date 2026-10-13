import {
    CalendarClock,
    Layers,
    Milestone,
    Timer,
    Trash2,
    User,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import {
    DEPENDENCY_LABELS,
    durationBetween,
    finishDate,
    formatLongDate,
    parseDate,
    PRIORITY_STYLES,
    snapToWorkingDay,
    toIso,
    todayIso,
} from '@/lib/gantt';
import { cn } from '@/lib/utils';
import type {
    DependencyType,
    Task,
    TaskOptions,
    TaskPayload,
    TaskPriority,
    TaskType,
} from '@/types/gantt';

interface TaskFormModalProps {
    open: boolean;
    task: Task | null;
    tasks: Task[];
    options: TaskOptions;
    processing: boolean;
    errors: Record<string, string>;
    onClose: () => void;
    onDelete?: (task: Task) => void;
    onSubmit: (payload: TaskPayload) => void;
}

const TYPE_OPTIONS: { value: TaskType; label: string; hint: string }[] = [
    { value: 'regular', label: 'Regular Task', hint: 'Aktivitas berdurasi' },
    {
        value: 'summary',
        label: 'Summary / Parent',
        hint: 'Mengikuti sub-tugas',
    },
    { value: 'milestone', label: 'Milestone', hint: 'Durasi 0 hari' },
];

const RELATION_HINTS: Record<DependencyType, string> = {
    FS: 'Penerus mulai setelah pendahulu selesai',
    SS: 'Penerus mulai bersamaan dengan pendahulu',
    FF: 'Penerus selesai bersamaan dengan pendahulu',
    SF: 'Penerus selesai saat pendahulu mulai',
};

const FIELD =
    'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const LABEL = 'mb-1 block text-xs font-medium text-gray-600';

export default function TaskFormModal({
    open,
    task,
    tasks,
    options,
    processing,
    errors,
    onClose,
    onDelete,
    onSubmit,
}: TaskFormModalProps) {
    const [name, setName] = useState('');
    const [taskType, setTaskType] = useState<TaskType>('regular');
    const [startDate, setStartDate] = useState(todayIso());
    const [duration, setDuration] = useState(1);
    const [endDate, setEndDate] = useState(todayIso());
    const [progress, setProgress] = useState(0);
    const [priority, setPriority] = useState<TaskPriority>('Normal');
    const [parentId, setParentId] = useState<string>('');
    const [predecessorId, setPredecessorId] = useState<string>('');
    const [dependencyType, setDependencyType] = useState<DependencyType>('FS');
    const [lagDays, setLagDays] = useState(0);
    const [resources, setResources] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    const isMilestone = taskType === 'milestone';
    const isSummary = taskType === 'summary';

    useEffect(() => {
        if (!open) {
            return;
        }

        setLocalError(null);

        if (task === null) {
            const start = snapToWorkingDay(parseDate(todayIso()));
            setName('');
            setTaskType('regular');
            setStartDate(toIso(start));
            setDuration(5);
            setEndDate(toIso(finishDate(start, 5)));
            setProgress(0);
            setPriority('Normal');
            setParentId('');
            setPredecessorId('');
            setDependencyType('FS');
            setLagDays(0);
            setResources('');

            return;
        }

        setName(task.name);
        setTaskType(task.task_type);
        setStartDate(task.start_date);
        setDuration(task.duration_days);
        setEndDate(task.end_date);
        setProgress(task.progress);
        setPriority(task.priority);
        setParentId(task.parent_id === null ? '' : String(task.parent_id));
        setPredecessorId(
            task.predecessor_id === null ? '' : String(task.predecessor_id),
        );
        setDependencyType(task.dependency_type);
        setLagDays(task.lag_days);
        setResources(task.resource_names ?? '');
    }, [open, task]);

    const applyDuration = (nextDuration: number): void => {
        const safe = isMilestone ? 0 : Math.max(0, nextDuration);
        setDuration(safe);
        setEndDate(toIso(finishDate(parseDate(startDate), safe)));
    };

    const applyStart = (nextStart: string): void => {
        setStartDate(nextStart);
        setEndDate(toIso(finishDate(parseDate(nextStart), duration)));
    };

    const applyEnd = (nextEnd: string): void => {
        setEndDate(nextEnd);
        setDuration(durationBetween(parseDate(startDate), parseDate(nextEnd)));
    };

    const selectType = (next: TaskType): void => {
        setTaskType(next);

        if (next === 'milestone') {
            setDuration(0);
            setEndDate(startDate);
        } else if (next === 'summary' && duration === 0) {
            setDuration(5);
            setEndDate(toIso(finishDate(parseDate(startDate), 5)));
        }
    };

    const parentOptions = useMemo(
        () =>
            tasks.filter(
                (candidate) =>
                    candidate.id !== task?.id &&
                    candidate.task_type !== 'milestone',
            ),
        [tasks, task],
    );

    const predecessorOptions = useMemo(
        () =>
            tasks.filter(
                (candidate) =>
                    candidate.id !== task?.id &&
                    candidate.task_type !== 'summary',
            ),
        [tasks, task],
    );

    const handleSubmit = (event: React.FormEvent): void => {
        event.preventDefault();

        if (name.trim() === '') {
            setLocalError('Nama tugas wajib diisi.');
            return;
        }

        if (predecessorId !== '' && predecessorId === String(task?.id ?? '')) {
            setLocalError('Tugas tidak dapat menjadi predecessor dirinya.');
            return;
        }

        setLocalError(null);

        onSubmit({
            name: name.trim(),
            task_type: taskType,
            start_date: startDate,
            duration_days: isMilestone ? 0 : duration,
            progress,
            priority,
            parent_id: parentId === '' ? null : Number(parentId),
            predecessor_id: predecessorId === '' ? null : Number(predecessorId),
            dependency_type: dependencyType,
            lag_days: lagDays,
            resource_names: resources.trim() === '' ? null : resources.trim(),
        });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={
                task === null ? 'Tambah Tugas' : `Ubah Tugas · ${task.wbs_code}`
            }
            description="Seluruh atribut standar Gantt Chart: jenis tugas, jadwal hari kerja, progres, dependensi, sumber daya, dan prioritas."
            icon={<CalendarClock className="h-4 w-4" />}
            footer={
                <>
                    {task !== null && onDelete !== undefined ? (
                        <button
                            type="button"
                            onClick={() => onDelete(task)}
                            className="mr-auto inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                            <Trash2 size={13} />
                            Hapus Tugas
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Batal
                    </button>
                    <button
                        type="submit"
                        form="task-form"
                        disabled={processing}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        {task === null ? 'Simpan Tugas' : 'Simpan Perubahan'}
                    </button>
                </>
            }
        >
            <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label className={LABEL} htmlFor="task-name">
                            Task Name
                        </label>
                        <input
                            id="task-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Contoh: Pengembangan Modul Pendaftaran"
                            className={FIELD}
                        />
                        <FieldError
                            message={errors.name ?? localError ?? undefined}
                        />
                    </div>

                    <div className="sm:col-span-2">
                        <span className={LABEL}>Task Type</span>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {TYPE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => selectType(option.value)}
                                    className={cn(
                                        'rounded-md border px-2.5 py-2 text-left text-xs transition',
                                        taskType === option.value
                                            ? 'border-blue-500 bg-blue-50 text-blue-800'
                                            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
                                    )}
                                >
                                    <span className="flex items-center gap-1.5 font-medium">
                                        {option.value === 'summary' ? (
                                            <Layers size={13} />
                                        ) : null}
                                        {option.value === 'milestone' ? (
                                            <Milestone size={13} />
                                        ) : null}
                                        {option.value === 'regular' ? (
                                            <Timer size={13} />
                                        ) : null}
                                        {option.label}
                                    </span>
                                    <span className="mt-0.5 block text-[10px] text-gray-500">
                                        {option.hint}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <FieldError message={errors.task_type} />
                    </div>

                    <div>
                        <label className={LABEL} htmlFor="start-date">
                            Start Date
                        </label>
                        <input
                            id="start-date"
                            type="date"
                            value={startDate}
                            disabled={isSummary}
                            onChange={(event) => applyStart(event.target.value)}
                            className={cn(FIELD, isSummary && 'bg-gray-100')}
                        />
                        <FieldError message={errors.start_date} />
                    </div>

                    <div>
                        <label className={LABEL} htmlFor="duration">
                            Duration (hari kerja)
                        </label>
                        <input
                            id="duration"
                            type="number"
                            min={0}
                            max={365}
                            value={isMilestone ? 0 : duration}
                            disabled={isMilestone || isSummary}
                            onChange={(event) =>
                                applyDuration(Number(event.target.value))
                            }
                            className={cn(
                                FIELD,
                                (isMilestone || isSummary) && 'bg-gray-100',
                            )}
                        />
                        <FieldError message={errors.duration_days} />
                    </div>

                    <div>
                        <label className={LABEL} htmlFor="end-date">
                            End Date (otomatis)
                        </label>
                        <input
                            id="end-date"
                            type="date"
                            value={endDate}
                            disabled={isMilestone || isSummary}
                            onChange={(event) => applyEnd(event.target.value)}
                            className={cn(
                                FIELD,
                                (isMilestone || isSummary) && 'bg-gray-100',
                            )}
                        />
                        <FieldError message={errors.end_date} />
                    </div>

                    <div>
                        <label className={LABEL} htmlFor="parent">
                            Fase / Parent Task
                        </label>
                        <select
                            id="parent"
                            value={parentId}
                            onChange={(event) =>
                                setParentId(event.target.value)
                            }
                            className={FIELD}
                        >
                            <option value="">— Tanpa induk —</option>
                            {parentOptions.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                    {candidate.wbs_code} · {candidate.name}
                                </option>
                            ))}
                        </select>
                        <FieldError message={errors.parent_id} />
                    </div>

                    <div className="sm:col-span-2">
                        <label className={LABEL} htmlFor="progress">
                            % Progress —{' '}
                            <span className="font-mono text-gray-900">
                                {progress}%
                            </span>
                        </label>
                        <input
                            id="progress"
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={progress}
                            onChange={(event) =>
                                setProgress(Number(event.target.value))
                            }
                            className="w-full accent-blue-600"
                        />
                        <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                            <span>0%</span>
                            <span>Not Started · In Progress · Completed</span>
                            <span>100%</span>
                        </div>
                        <FieldError message={errors.progress} />
                    </div>

                    <div>
                        <label className={LABEL} htmlFor="predecessor">
                            Predecessor
                        </label>
                        <select
                            id="predecessor"
                            value={predecessorId}
                            disabled={isSummary}
                            onChange={(event) =>
                                setPredecessorId(event.target.value)
                            }
                            className={cn(FIELD, isSummary && 'bg-gray-100')}
                        >
                            <option value="">— Tanpa pendahulu —</option>
                            {predecessorOptions.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                    {candidate.wbs_code} · {candidate.name}
                                </option>
                            ))}
                        </select>
                        <FieldError message={errors.predecessor_id} />
                    </div>

                    <div>
                        <label className={LABEL} htmlFor="dependency">
                            Dependency Type
                        </label>
                        <select
                            id="dependency"
                            value={dependencyType}
                            disabled={isSummary || predecessorId === ''}
                            onChange={(event) =>
                                setDependencyType(
                                    event.target.value as DependencyType,
                                )
                            }
                            className={cn(
                                FIELD,
                                (isSummary || predecessorId === '') &&
                                    'bg-gray-100',
                            )}
                        >
                            {options.dependencyTypes.map((type) => (
                                <option key={type} value={type}>
                                    {options.dependencyLabels[type] ?? type}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-[10px] text-gray-500">
                            {RELATION_HINTS[dependencyType]}
                        </p>
                        <FieldError message={errors.dependency_type} />
                    </div>

                    <div>
                        <label className={LABEL} htmlFor="lag">
                            Lag / Lead (hari)
                        </label>
                        <input
                            id="lag"
                            type="number"
                            min={-365}
                            max={365}
                            value={lagDays}
                            disabled={isSummary || predecessorId === ''}
                            onChange={(event) =>
                                setLagDays(Number(event.target.value))
                            }
                            className={cn(
                                FIELD,
                                (isSummary || predecessorId === '') &&
                                    'bg-gray-100',
                            )}
                        />
                        <p className="mt-1 text-[10px] text-gray-500">
                            Positif = jeda, negatif = percepatan (lead).
                        </p>
                        <FieldError message={errors.lag_days} />
                    </div>

                    <div>
                        <label className={LABEL} htmlFor="resources">
                            Resource Assignment
                        </label>
                        <div className="relative">
                            <User
                                size={13}
                                className="absolute top-2.5 left-2.5 text-gray-400"
                            />
                            <input
                                id="resources"
                                value={resources}
                                onChange={(event) =>
                                    setResources(event.target.value)
                                }
                                placeholder="Rani, Bagus, Tim QA"
                                className={cn(FIELD, 'pl-7')}
                            />
                        </div>
                        <FieldError message={errors.resource_names} />
                    </div>

                    <div>
                        <label className={LABEL} htmlFor="priority">
                            Priority
                        </label>
                        <select
                            id="priority"
                            value={priority}
                            onChange={(event) =>
                                setPriority(event.target.value as TaskPriority)
                            }
                            className={FIELD}
                        >
                            {options.priorities.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                        <span
                            className={cn(
                                'mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                                PRIORITY_STYLES[priority],
                            )}
                        >
                            {priority}
                        </span>
                        <FieldError message={errors.priority} />
                    </div>
                </div>

                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                    <p>
                        Jadwal:{' '}
                        <span className="font-medium text-gray-900">
                            {formatLongDate(startDate)}
                        </span>{' '}
                        →{' '}
                        <span className="font-medium text-gray-900">
                            {formatLongDate(endDate)}
                        </span>{' '}
                        ·{' '}
                        <span className="font-medium text-gray-900">
                            {isMilestone ? 0 : duration} hari kerja
                        </span>
                    </p>
                    <p className="mt-0.5">
                        Akhir pekan otomatis dilewati (Senin–Jumat) dan{' '}
                        {DEPENDENCY_LABELS[dependencyType]} menjaga urutan
                        aktivitas.
                    </p>
                </div>
            </form>
        </Modal>
    );
}

function FieldError({ message }: { message?: string }) {
    if (message === undefined) {
        return null;
    }

    return <p className="mt-1 text-[11px] text-red-600">{message}</p>;
}
