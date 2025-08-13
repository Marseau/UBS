import { EventEmitter } from "events";
import * as fs from "fs/promises";
import * as path from "path";

export interface AgentTask {
  id: string;
  type: "frontend" | "backend" | "database" | "ai" | "test";
  description: string;
  files: string[];
  dependencies: string[];
  status: "pending" | "in_progress" | "completed" | "blocked";
  assignedTo?: string;
  output?: any;
  progress?: number;
}

export interface AgentMessage {
  id: string;
  from: string;
  to: string | "broadcast";
  type: "request" | "response" | "update" | "block" | "complete";
  content: any;
  timestamp: Date;
}

export interface AgentState {
  id: string;
  type: string;
  status: "idle" | "working" | "blocked" | "completed";
  currentTask?: string;
  capabilities: string[];
}

export interface ProjectState {
  goal: string;
  status: "planning" | "in_progress" | "review" | "completed";
  startedAt: Date;
  agents: Record<string, AgentState>;
  tasks: AgentTask[];
  messages: AgentMessage[];
  sharedContext: any;
}

export class AgentOrchestrator extends EventEmitter {
  private projectState: ProjectState = {
    goal: "",
    status: "planning",
    startedAt: new Date(),
    agents: {},
    tasks: [],
    messages: [],
    sharedContext: {},
  };
  private stateFile = ".agent-state.json";
  private messageQueue: AgentMessage[] = [];

  constructor() {
    super();
    this.initializeState();
  }

  private async initializeState() {
    try {
      const data = await fs.readFile(this.stateFile, "utf-8");
      this.projectState = JSON.parse(data);
    } catch {
      this.projectState = {
        goal: "",
        status: "planning",
        startedAt: new Date(),
        agents: {},
        tasks: [],
        messages: [],
        sharedContext: {},
      };
    }
  }

  async saveState() {
    await fs.writeFile(
      this.stateFile,
      JSON.stringify(this.projectState, null, 2),
    );
  }

  async startProject(goal: string) {
    console.log(`🚀 Iniciando projeto multi-agente: ${goal}`);

    this.projectState.goal = goal;
    this.projectState.status = "planning";
    this.projectState.startedAt = new Date();

    // Fase 1: Análise e decomposição
    const tasks = await this.analyzeAndDecompose(goal);

    // Fase 2: Atribuir tarefas aos agentes
    await this.distributeTasks(tasks);

    // Fase 3: Coordenar execução
    await this.coordinateExecution();

    // Fase 4: Validar e integrar
    await this.validateIntegration();

    console.log("✅ Projeto concluído!");
    return this.projectState;
  }

  private async analyzeAndDecompose(goal: string): Promise<AgentTask[]> {
    console.log("🔍 Analisando e decompondo objetivo...");

    // Simulação de análise - em produção, usar IA para decomposição
    const tasks: AgentTask[] = [];

    // Exemplo: Sistema de notificações
    if (goal.includes("notificações") || goal.includes("notifications")) {
      tasks.push(
        {
          id: "task-db-001",
          type: "database",
          description: "Criar schema de notificações",
          files: [
            "database/migrations/create-notifications-table.sql",
            "src/types/notification.types.ts",
          ],
          dependencies: [],
          status: "pending",
        },
        {
          id: "task-backend-001",
          type: "backend",
          description: "Implementar serviço de notificações",
          files: [
            "src/services/notification.service.ts",
            "src/routes/notifications.ts",
          ],
          dependencies: ["task-db-001"],
          status: "pending",
        },
        {
          id: "task-frontend-001",
          type: "frontend",
          description: "Criar widget de notificações",
          files: [
            "src/frontend/js/widgets/notification-widget.js",
            "src/frontend/css/notifications.css",
          ],
          dependencies: ["task-backend-001"],
          status: "pending",
        },
        {
          id: "task-test-001",
          type: "test",
          description: "Testes de integração",
          files: ["tests/notifications.test.ts"],
          dependencies: ["task-frontend-001"],
          status: "pending",
        },
      );
    }

    this.projectState.tasks = tasks;
    await this.saveState();

    return tasks;
  }

  private async distributeTasks(tasks: AgentTask[]) {
    console.log("📋 Distribuindo tarefas para agentes...");

    // Registrar agentes
    const agentTypes = ["database", "backend", "frontend", "test"];

    for (const type of agentTypes) {
      this.projectState.agents[`agent-${type}`] = {
        id: `agent-${type}`,
        type,
        status: "idle",
        capabilities: this.getAgentCapabilities(type),
      };
    }

    // Atribuir tarefas
    for (const task of tasks) {
      const agentId = `agent-${task.type}`;
      task.assignedTo = agentId;

      // Notificar agente
      await this.sendMessage({
        id: `msg-${Date.now()}`,
        from: "orchestrator",
        to: agentId,
        type: "request",
        content: { task },
        timestamp: new Date(),
      });
    }

    await this.saveState();
  }

  private async coordinateExecution() {
    console.log("🔄 Coordenando execução dos agentes...");

    this.projectState.status = "in_progress";

    // Executar tarefas respeitando dependências
    while (this.hasIncompleteTasks()) {
      const readyTasks = this.getReadyTasks();

      for (const task of readyTasks) {
        if (task.status === "pending") {
          await this.executeTask(task);
        }
      }

      // Processar mensagens entre agentes
      await this.processMessageQueue();

      // Aguardar um pouco antes de verificar novamente
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Atualizar estado
      await this.saveState();
    }
  }

  private async executeTask(task: AgentTask) {
    console.log(`⚡ Executando tarefa: ${task.description}`);

    task.status = "in_progress";
    const agent = this.projectState.agents[task.assignedTo!];
    if (agent) {
      agent.status = "working";
      agent.currentTask = task.id;
    }

    // Simular execução da tarefa
    // Em produção, cada agente executaria seu trabalho real

    // Progresso incremental
    for (let progress = 0; progress <= 100; progress += 20) {
      task.progress = progress;

      await this.sendMessage({
        id: `msg-${Date.now()}`,
        from: task.assignedTo!,
        to: "orchestrator",
        type: "update",
        content: { taskId: task.id, progress },
        timestamp: new Date(),
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Completar tarefa
    task.status = "completed";
    task.output = {
      filesCreated: task.files,
      summary: `Tarefa ${task.description} concluída com sucesso`,
    };

    if (agent) {
      agent.status = "idle";
      agent.currentTask = undefined;
    }

    // Notificar conclusão
    await this.sendMessage({
      id: `msg-${Date.now()}`,
      from: task.assignedTo!,
      to: "broadcast",
      type: "complete",
      content: {
        taskId: task.id,
        output: task.output,
      },
      timestamp: new Date(),
    });

    // Atualizar contexto compartilhado
    this.updateSharedContext(task);
  }

  private updateSharedContext(task: AgentTask) {
    // Adicionar informações relevantes ao contexto compartilhado
    if (task.type === "database" && task.output) {
      this.projectState.sharedContext.databaseSchema = {
        ...this.projectState.sharedContext.databaseSchema,
        ...task.output.schema,
      };
    }

    if (task.type === "backend" && task.output) {
      this.projectState.sharedContext.apiEndpoints = [
        ...(this.projectState.sharedContext.apiEndpoints || []),
        ...(task.output.endpoints || []),
      ];
    }

    if (task.type === "frontend" && task.output) {
      this.projectState.sharedContext.frontendComponents = {
        ...this.projectState.sharedContext.frontendComponents,
        ...task.output.components,
      };
    }
  }

  private async validateIntegration() {
    console.log("✔️ Validando integração do projeto...");

    this.projectState.status = "review";

    // Verificar se todas as tarefas foram concluídas
    const allCompleted = this.projectState.tasks.every(
      (task) => task.status === "completed",
    );

    if (allCompleted) {
      this.projectState.status = "completed";
      console.log("🎉 Projeto validado e concluído com sucesso!");
    } else {
      console.log("⚠️ Algumas tarefas não foram concluídas");
    }

    await this.saveState();
  }

  private hasIncompleteTasks(): boolean {
    return this.projectState.tasks.some((task) => task.status !== "completed");
  }

  private getReadyTasks(): AgentTask[] {
    return this.projectState.tasks.filter((task) => {
      if (task.status !== "pending") return false;

      // Verificar se todas as dependências foram concluídas
      return task.dependencies.every((depId) => {
        const dep = this.projectState.tasks.find((t) => t.id === depId);
        return dep?.status === "completed";
      });
    });
  }

  private async sendMessage(message: AgentMessage) {
    this.messageQueue.push(message);
    this.projectState.messages.push(message);

    // Emitir evento para agentes interessados
    this.emit("message", message);

    // Log da mensagem
    console.log(
      `💬 ${message.from} → ${message.to}: ${message.type} - ${JSON.stringify(message.content).substring(0, 50)}...`,
    );
  }

  private async processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;

      // Processar mensagens especiais
      if (message.type === "block") {
        const task = this.projectState.tasks.find(
          (t) => t.id === message.content.taskId,
        );
        if (task) {
          task.status = "blocked";
          console.log(
            `🚫 Tarefa ${task.id} bloqueada: ${message.content.reason}`,
          );
        }
      }
    }
  }

  private getAgentCapabilities(type: string): string[] {
    const capabilities: Record<string, string[]> = {
      database: ["sql", "migrations", "schema-design", "indexing"],
      backend: ["typescript", "api", "services", "authentication"],
      frontend: ["html", "css", "javascript", "widgets", "responsive"],
      ai: ["nlp", "ml", "prompts", "fine-tuning"],
      test: ["unit", "integration", "e2e", "performance"],
    };

    return capabilities[type] || [];
  }

  // API pública para interação externa
  async getProjectStatus() {
    return {
      goal: this.projectState.goal,
      status: this.projectState.status,
      progress: this.calculateOverallProgress(),
      agents: Object.values(this.projectState.agents),
      tasks: this.projectState.tasks,
      sharedContext: this.projectState.sharedContext,
    };
  }

  private calculateOverallProgress(): number {
    if (this.projectState.tasks.length === 0) return 0;

    const completedTasks = this.projectState.tasks.filter(
      (t) => t.status === "completed",
    ).length;

    return Math.round((completedTasks / this.projectState.tasks.length) * 100);
  }

  async requestAgentCollaboration(
    fromAgent: string,
    toAgent: string,
    request: any,
  ) {
    await this.sendMessage({
      id: `msg-${Date.now()}`,
      from: fromAgent,
      to: toAgent,
      type: "request",
      content: request,
      timestamp: new Date(),
    });
  }
}

// Exportar instância singleton
export const orchestrator = new AgentOrchestrator();
