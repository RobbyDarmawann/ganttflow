export type TaskType = 'regular' | 'summary' | 'milestone';

export type TaskPriority = 'Low' | 'Normal' | 'High' | 'Critical';

export type TaskStatus = 'Not Started' | 'In Progress' | 'Completed';

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export type ZoomLevel = 'day' | 'week' | 'month';

export type ViewMode = 'gantt' | 'network';

export interface Task {
    id: number;
    wbs_code: string;
    name: string;
    task_type: TaskType;
    start_date: string;
    end_date: string;
    duration_days: number;
    progress: number;
    priority: TaskPriority;
    parent_id: number | null;
    parent_name?: string | null;
    predecessor_id: number | null;
    predecessor_name?: string | null;
    predecessor_wbs_code?: string | null;
    dependency_type: DependencyType;
    lag_days: number;
    resource_names: string | null;
    status: TaskStatus;
}

export interface AnalysisNode {
    id: number;
    wbs_code: string;
    name: string;
    task_type: TaskType;
    is_milestone: boolean;
    duration_days: number;
    early_start: number;
    early_finish: number;
    late_start: number;
    late_finish: number;
    slack: number;
    is_critical: boolean;
}

export interface ProjectAnalysis {
    has_tasks: boolean;
    project_start: string | null;
    project_end: string | null;
    project_duration_days: number;
    critical_path_ids: number[];
    critical_path_names: string[];
    nodes: Record<string, AnalysisNode>;
}

export interface TaskOptions {
    taskTypes: TaskType[];
    taskTypeLabels: Record<TaskType, string>;
    priorities: TaskPriority[];
    statuses: TaskStatus[];
    dependencyTypes: DependencyType[];
    dependencyLabels: Record<DependencyType, string>;
    workingDays: string[];
}

export interface TaskPayload {
    name: string;
    task_type: TaskType;
    start_date: string;
    duration_days: number;
    progress: number;
    priority: TaskPriority;
    parent_id: number | null;
    predecessor_id: number | null;
    dependency_type: DependencyType;
    lag_days: number;
    resource_names: string | null;
}

export interface GanttRow {
    task: Task;
    depth: number;
    hasChildren: boolean;
    collapsed: boolean;
    children: number[];
}

export interface TimelineDay {
    date: string;
    day: number;
    month: number;
    year: number;
    weekday: number;
    isWeekend: boolean;
    isToday: boolean;
}

export interface TimelineTierCell {
    key: string;
    label: string;
    span: number;
    offset: number;
}

export interface Timeline {
    zoom: ZoomLevel;
    dayWidth: number;
    start: string;
    end: string;
    days: TimelineDay[];
    index: Record<string, number>;
    months: TimelineTierCell[];
    ticks: TimelineTierCell[];
    width: number;
    todayOffset: number | null;
}

export interface GanttFlowPageProps {
    tasks: Task[];
    analysis: ProjectAnalysis;
    options: TaskOptions;
    flash?: {
        success?: string | null;
    };
}
