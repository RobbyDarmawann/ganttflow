<?php

use App\Enums\DependencyType;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table): void {
            $table->id();
            $table->string('wbs_code')->default('');
            $table->string('name');
            $table->enum('task_type', TaskType::values())->default(TaskType::Regular->value);
            $table->date('start_date');
            $table->date('end_date');
            $table->integer('duration_days')->default(1)->comment('Working days; 0 for milestones');
            $table->unsignedTinyInteger('progress')->default(0)->comment('Percent complete, 0-100');
            $table->enum('priority', TaskPriority::values())->default(TaskPriority::Normal->value);
            $table->foreignId('parent_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->foreignId('predecessor_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->enum('dependency_type', DependencyType::values())->default(DependencyType::FinishToStart->value);
            $table->integer('lag_days')->default(0)->comment('Positive lag, negative lead');
            $table->string('resource_names')->nullable()->comment('Assigned team members');
            $table->enum('status', TaskStatus::values())->default(TaskStatus::NotStarted->value);
            $table->timestamps();

            $table->index(['parent_id', 'start_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
