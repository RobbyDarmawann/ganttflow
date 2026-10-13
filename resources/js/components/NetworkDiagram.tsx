import { useMemo } from 'react';
import { connectorPath, laneBetweenRows } from '@/lib/gantt';
import { cn } from '@/lib/utils';
import type { AnalysisNode, ProjectAnalysis, Task } from '@/types/gantt';

const NODE_WIDTH = 168;
const NODE_HEIGHT = 92;
const H_GAP = 56;
const V_GAP = 22;
const PAD = 24;
const PITCH = NODE_HEIGHT + V_GAP;

interface NetworkDiagramProps {
    tasks: Task[];
    analysis: ProjectAnalysis;
    showCritical: boolean;
    onSelect: (task: Task) => void;
}

interface PlacedNode {
    node: AnalysisNode;
    task: Task;
    x: number;
    y: number;
    level: number;
}

export default function NetworkDiagram({
    tasks,
    analysis,
    showCritical,
    onSelect,
}: NetworkDiagramProps) {
    const { nodes, width, height, edges } = useMemo(() => {
        const byId = new Map(tasks.map((task) => [task.id, task]));
        const analysisNodes = Object.values(analysis.nodes);

        const levels = assignLevels(tasks, analysisNodes);
        const grouped = new Map<number, PlacedNode[]>();

        for (const node of analysisNodes) {
            const level = levels.get(node.id) ?? 0;
            const bucket = grouped.get(level) ?? [];
            const task = byId.get(node.id);

            if (task === undefined) {
                continue;
            }

            bucket.push({ node, task, x: 0, y: 0, level });
            grouped.set(level, bucket);
        }

        const placed: PlacedNode[] = [];
        let maxRows = 1;

        for (const [level, bucket] of [...grouped.entries()].sort(
            (a, b) => a[0] - b[0],
        )) {
            bucket.sort(
                (a, b) =>
                    a.node.early_start - b.node.early_start ||
                    a.node.id - b.node.id,
            );
            maxRows = Math.max(maxRows, bucket.length);

            bucket.forEach((entry, index) => {
                entry.x = PAD + level * (NODE_WIDTH + H_GAP);
                entry.y = PAD + index * (NODE_HEIGHT + V_GAP);
                placed.push(entry);
            });
        }

        const positions = new Map(
            placed.map((entry) => [entry.node.id, entry]),
        );
        const links: { key: number; d: string }[] = [];

        for (const entry of placed) {
            const predecessorId = entry.task.predecessor_id;

            if (predecessorId === null) {
                continue;
            }

            const from = positions.get(predecessorId);

            if (from === undefined) {
                continue;
            }

            const fromY = from.y + NODE_HEIGHT / 2;
            const toY = entry.y + NODE_HEIGHT / 2;

            links.push({
                key: entry.node.id,
                d: connectorPath(
                    { x: from.x + NODE_WIDTH, y: fromY },
                    // Stubs sit in the column gutters, the long horizontal in
                    // the row gutter, so the link never crosses a node box.
                    from.x + NODE_WIDTH + 16,
                    entry.x - 16,
                    { x: entry.x, y: toY },
                    laneBetweenRows(
                        fromY,
                        toY,
                        PITCH,
                        PAD + NODE_HEIGHT + V_GAP / 2,
                    ),
                ),
            });
        }

        const depth = placed.reduce(
            (max, entry) => Math.max(max, entry.level),
            0,
        );
        const columns = depth + 1;

        return {
            nodes: placed,
            edges: links,
            width: PAD * 2 + columns * NODE_WIDTH + (columns - 1) * H_GAP,
            height: PAD * 2 + maxRows * NODE_HEIGHT + (maxRows - 1) * V_GAP,
        };
    }, [tasks, analysis]);

    if (nodes.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center rounded-md border border-gray-200 bg-white text-sm text-gray-500">
                Diagram jaringan akan muncul setelah ada aktivitas terjadwal.
            </div>
        );
    }

    return (
        <div className="overflow-auto rounded-md border border-gray-200 bg-white">
            <div className="relative" style={{ width, height }}>
                <svg
                    className="pointer-events-none absolute inset-0"
                    width={width}
                    height={height}
                >
                    <defs>
                        <marker
                            id="network-arrow"
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                        </marker>
                        <marker
                            id="network-arrow-critical"
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
                        </marker>
                    </defs>

                    {edges.map((edge) => {
                        const successor = nodes.find(
                            (entry) => entry.node.id === edge.key,
                        );
                        const critical =
                            showCritical &&
                            successor?.node.is_critical === true;

                        return (
                            <path
                                key={edge.key}
                                d={edge.d}
                                fill="none"
                                stroke={critical ? '#dc2626' : '#cbd5e1'}
                                strokeWidth={critical ? 2 : 1.5}
                                markerEnd={
                                    critical
                                        ? 'url(#network-arrow-critical)'
                                        : 'url(#network-arrow)'
                                }
                            />
                        );
                    })}
                </svg>

                {nodes.map((entry) => {
                    const node = entry.node;
                    const critical = showCritical && node.is_critical;

                    return (
                        <button
                            key={node.id}
                            type="button"
                            onClick={() => onSelect(entry.task)}
                            style={{
                                left: entry.x,
                                top: entry.y,
                                width: NODE_WIDTH,
                                height: NODE_HEIGHT,
                            }}
                            className={cn(
                                'absolute rounded-md border bg-white px-2.5 py-1.5 text-left shadow-sm transition hover:shadow-md',
                                critical
                                    ? 'border-red-400 ring-1 ring-red-300'
                                    : 'border-gray-300',
                            )}
                        >
                            <div className="flex items-center justify-between text-[10px] text-gray-500">
                                <span className="font-mono">
                                    {node.wbs_code}
                                </span>
                                <span
                                    className={cn(
                                        'rounded px-1 py-px font-medium',
                                        node.is_milestone
                                            ? 'bg-amber-100 text-amber-800'
                                            : critical
                                              ? 'bg-red-100 text-red-700'
                                              : 'bg-gray-100 text-gray-600',
                                    )}
                                >
                                    {node.is_milestone
                                        ? 'Milestone'
                                        : `Slack ${node.slack}d`}
                                </span>
                            </div>

                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight font-medium text-gray-900">
                                {node.name}
                            </p>

                            <dl className="mt-1 grid grid-cols-2 gap-x-2 font-mono text-[10px] text-gray-500">
                                <div>
                                    ES{' '}
                                    <span className="text-gray-800">
                                        {node.early_start}
                                    </span>
                                </div>
                                <div>
                                    EF{' '}
                                    <span className="text-gray-800">
                                        {node.early_finish}
                                    </span>
                                </div>
                                <div>
                                    LS{' '}
                                    <span className="text-gray-800">
                                        {node.late_start}
                                    </span>
                                </div>
                                <div>
                                    LF{' '}
                                    <span className="text-gray-800">
                                        {node.late_finish}
                                    </span>
                                </div>
                            </dl>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Longest chain of dependencies that reaches each activity, so every task is
 * drawn to the right of the tasks it depends on. Cycles short-circuit to the
 * current depth instead of recursing forever.
 */
function assignLevels(
    tasks: Task[],
    nodes: AnalysisNode[],
): Map<number, number> {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const inNetwork = new Set(nodes.map((node) => node.id));
    const levels = new Map<number, number>();

    const resolve = (id: number, seen: Set<number>): number => {
        const cached = levels.get(id);

        if (cached !== undefined) {
            return cached;
        }

        if (seen.has(id)) {
            return 0;
        }

        seen.add(id);

        const task = byId.get(id);
        const predecessorId = task?.predecessor_id ?? null;
        const level =
            predecessorId !== null && inNetwork.has(predecessorId)
                ? resolve(predecessorId, seen) + 1
                : 0;

        levels.set(id, level);

        return level;
    };

    for (const node of nodes) {
        resolve(node.id, new Set());
    }

    return levels;
}
