"use client";

import { useEffect } from "react";
import { migrateStorageToDatabaseOnce } from "@/lib/storage";
import { migrateGeneratedSetsToDbOnce } from "@/lib/question-storage";
import { migrateTtsRateOnce } from "@/lib/tts-settings";
import { migrateTimeZoneOnce } from "@/lib/timezone-settings";

export function MigrationBootstrap() {
  useEffect(() => {
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
