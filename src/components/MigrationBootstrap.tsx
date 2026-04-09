"use client";

import { useEffect } from "react";
import { migrateStorageToDatabaseOnce } from "@/lib/storage";
import { migrateGeneratedSetsToDbOnce } from "@/lib/question-storage";
import { migrateTtsRateOnce } from "@/lib/tts-settings";

export function MigrationBootstrap() {
  useEffect(() => {
    const run = async () => {
      await migrateStorageToDatabaseOnce();
      await migrateGeneratedSetsToDbOnce();
      await migrateTtsRateOnce();
    };
    void run();
  }, []);

  return null;
}

