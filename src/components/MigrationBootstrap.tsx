"use client";

import { useEffect } from "react";
import { migrateStorageToDatabaseOnce } from "@/lib/storage";
import { migrateGeneratedSetsToDbOnce } from "@/lib/question-storage";
import { migrateTtsRateOnce } from "@/lib/tts-settings";
import { migrateTimeZoneOnce } from "@/lib/timezone-settings";
import { installSyncLifecycle } from "@/lib/sync-queue";

export function MigrationBootstrap() {
  useEffect(() => {
    installSyncLifecycle();
    const run = async () => {
      await migrateStorageToDatabaseOnce();
      await migrateGeneratedSetsToDbOnce();
      await migrateTtsRateOnce();
      await migrateTimeZoneOnce();
    };
    void run();
  }, []);

  return null;
}
