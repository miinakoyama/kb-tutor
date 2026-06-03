"use client";

import { useEffect } from "react";
import { migrateStorageToDatabaseOnce } from "@/lib/storage";
import { migrateGeneratedSetsToDbOnce } from "@/lib/question-storage";
import { migrateAppearanceOnce } from "@/lib/appearance-settings";
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
      await migrateAppearanceOnce();
    };
    void run();
  }, []);

  return null;
}
