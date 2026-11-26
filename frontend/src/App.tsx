import React, { useState } from "react";
import { Header } from "./components/Header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { TabLogs } from "./components/tabs/TabLogs";
import { TabInputQueue } from "./components/tabs/TabInputQueue";
import { TabOutputQueue } from "./components/tabs/TabOutputQueue";
import { TabDataSources } from "./components/tabs/TabDataSources";
import { TabDataAgents } from "./components/tabs/TabDataAgents";
import { TabWebhooks } from "./components/tabs/TabWebhooks";
import { TabTenantStats } from "./components/tabs/TabTenantStats";
import { useAuth } from "./context/AuthContext";
import { LogIn } from "lucide-react";
import { Button } from "./components/ui/button";

export const App: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const [activeTab, setActiveTab] = useState("logs");
  const [outputQueueParams, setOutputQueueParams] = useState<{ operation_id?: string; result_id?: string }>({});

  const handleNavigateToOutputQueue = (filters: { operation_id?: string; result_id?: string }) => {
    setOutputQueueParams(filters);
    setActiveTab("output_queue");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors duration-200">
      <Header />

      <main className="flex-grow max-w-[1720px] w-full mx-auto p-3 sm:p-4 md:p-6 space-y-4">
        {!isLoggedIn ? (
          <div className="py-20 text-center space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-400 flex items-center justify-center mx-auto text-3xl shadow-inner">
              🔒
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Aplikace není připojena k platformě
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pro zobrazení provozních logů, front zpráv a monitoringu agentů se prosím přihlaste svými údaji nebo zadejte platný Bearer Token v nastavení.
            </p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* 7 Tabs Bar */}
            <TabsList className="w-full bg-slate-200/60 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl flex flex-wrap h-auto gap-1">
              <TabsTrigger value="logs" className="gap-1.5 py-2 px-3">
                <span>📊</span>
                <span>Provozní logy</span>
              </TabsTrigger>

              <TabsTrigger value="input_queue" className="gap-1.5 py-2 px-3">
                <span>📥</span>
                <span>Vstupní fronta</span>
              </TabsTrigger>

              <TabsTrigger value="output_queue" className="gap-1.5 py-2 px-3">
                <span>📤</span>
                <span>Výstupní fronta</span>
              </TabsTrigger>

              <TabsTrigger value="data_sources" className="gap-1.5 py-2 px-3">
                <span>🔌</span>
                <span>Data Sources</span>
              </TabsTrigger>

              <TabsTrigger value="data_agents" className="gap-1.5 py-2 px-3">
                <span>🤖</span>
                <span>Data Agenti</span>
              </TabsTrigger>

              <TabsTrigger value="webhooks" className="gap-1.5 py-2 px-3">
                <span>🔔</span>
                <span>Webhooky</span>
              </TabsTrigger>

              <TabsTrigger value="tenant_stats" className="gap-1.5 py-2 px-3">
                <span>🏢</span>
                <span>Statistika tenantů</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab Contents */}
            <TabsContent value="logs" className="mt-4">
              <TabLogs onNavigateToOutputQueue={handleNavigateToOutputQueue} />
            </TabsContent>

            <TabsContent value="input_queue" className="mt-4">
              <TabInputQueue />
            </TabsContent>

            <TabsContent value="output_queue" className="mt-4">
              <TabOutputQueue initialFilters={outputQueueParams} />
            </TabsContent>

            <TabsContent value="data_sources" className="mt-4">
              <TabDataSources />
            </TabsContent>

            <TabsContent value="data_agents" className="mt-4">
              <TabDataAgents />
            </TabsContent>

            <TabsContent value="webhooks" className="mt-4">
              <TabWebhooks />
            </TabsContent>

            <TabsContent value="tenant_stats" className="mt-4">
              <TabTenantStats />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};
