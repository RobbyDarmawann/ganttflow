import {
    CalendarRange,
    GitBranch,
    GraduationCap,
    LayoutPanelLeft,
    MousePointerClick,
    Server,
} from 'lucide-react';
import Modal from '@/components/Modal';

interface AboutModalProps {
    open: boolean;
    onClose: () => void;
}

const FEATURES = [
    {
        icon: LayoutPanelLeft,
        title: 'Split-View WBS + Linimasa',
        body: 'Panel kiri berisi tabel WBS hierarkis (expand/collapse), panel kanan linimasa kalender dua tingkat dengan scroll vertikal tersinkron 1:1.',
    },
    {
        icon: CalendarRange,
        title: 'Kalender Hari Kerja',
        body: 'Durasi dihitung dalam hari kerja (Senin–Jumat). Akhir pekan diarsir, dan End Date selalu dihitung ulang saat Start Date atau Duration berubah.',
    },
    {
        icon: GitBranch,
        title: 'Dependensi & Jalur Kritis',
        body: 'Empat tipe relasi (FS, SS, FF, SF) dengan lag/lead, deteksi dependensi melingkar, dan analisis Critical Path Method (slack = 0 disorot merah).',
    },
    {
        icon: MousePointerClick,
        title: 'Interaksi Langsung',
        body: 'Balok dapat digeser dan diubah durasinya dengan drag, klik ganda pada nama tugas untuk mengganti nama, plus toolbar Go to Today, Fit to Screen, Expand/Collapse All.',
    },
    {
        icon: Server,
        title: 'Laravel + Inertia + React',
        body: 'Data tersimpan di MySQL, disajikan lewat Inertia tanpa API terpisah. Ringkasan (summary rollup) dan penomoran ulang WBS dihitung di sisi server.',
    },
    {
        icon: GraduationCap,
        title: 'Tujuan Akademik',
        body: 'Media pembelajaran standar industri penjadwalan proyek perangkat lunak (mengacu Microsoft Project, DHTMLX Gantt, dan Primavera P6).',
    },
];

export default function AboutModal({ open, onClose }: AboutModalProps) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title="Tentang GanttFlow"
            description="Penjadwal proyek perangkat lunak dengan Gantt Chart standar industri."
        >
            <div className="space-y-4 text-sm text-gray-600">
                <p>
                    <strong className="font-semibold text-gray-900">
                        GanttFlow
                    </strong>{' '}
                    adalah aplikasi penjadwalan proyek pengembangan sistem yang
                    menerapkan struktur WBS, kalender hari kerja, dependensi
                    antar aktivitas, dan analisis jalur kritis.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                    {FEATURES.map((feature) => (
                        <div
                            key={feature.title}
                            className="rounded-md border border-gray-200 bg-gray-50 p-3"
                        >
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900">
                                <feature.icon className="h-3.5 w-3.5 text-blue-600" />
                                {feature.title}
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                                {feature.body}
                            </p>
                        </div>
                    ))}
                </div>

                <dl className="grid gap-x-4 gap-y-2 border-t border-gray-200 pt-3 text-xs sm:grid-cols-2">
                    <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Penyusun</dt>
                        <dd className="text-right font-medium text-gray-900">
                            Mahasiswa Perancangan Sistem Informasi
                        </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Studi kasus</dt>
                        <dd className="text-right font-medium text-gray-900">
                            Pengembangan Sistem Kelola Pemberkasan
                        </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Stack</dt>
                        <dd className="text-right font-medium text-gray-900">
                            Laravel 12 · Inertia · React 19
                        </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Basis data</dt>
                        <dd className="text-right font-medium text-gray-900">
                            MySQL
                        </dd>
                    </div>
                </dl>
            </div>
        </Modal>
    );
}
