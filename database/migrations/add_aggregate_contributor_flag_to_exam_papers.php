<?php
declare(strict_types=1);

require_once __DIR__ . '/../../app/Config/Database.php';

use App\Config\Database;

try {
    $db = Database::getConnection();
    echo "--- ADDING is_aggregate_contributor FLAG TO EXAM TABLES ---\n";

    // Check if column exists in exam_papers
    $cols = $db->query("SHOW COLUMNS FROM exam_papers LIKE 'is_aggregate_contributor'")->fetchAll();
    if (empty($cols)) {
        $db->exec("ALTER TABLE exam_papers ADD COLUMN is_aggregate_contributor TINYINT(1) NOT NULL DEFAULT 1 AFTER marking_guide_pdf_path");
        echo "[OK] Added 'is_aggregate_contributor' column to 'exam_papers'.\n";
    } else {
        echo "[INFO] Column 'is_aggregate_contributor' already exists in 'exam_papers'.\n";
    }

    // Check if column exists in exam_marks
    $mCols = $db->query("SHOW COLUMNS FROM exam_marks LIKE 'is_aggregate_contributor'")->fetchAll();
    if (empty($mCols)) {
        $db->exec("ALTER TABLE exam_marks ADD COLUMN is_aggregate_contributor TINYINT(1) NOT NULL DEFAULT 1 AFTER is_absent");
        echo "[OK] Added 'is_aggregate_contributor' column to 'exam_marks'.\n";
    } else {
        echo "[INFO] Column 'is_aggregate_contributor' already exists in 'exam_marks'.\n";
    }

    // Ensure non-core auxiliary subjects (CAPE, Kiswahili, Local Languages if present) are flagged as 0
    $db->exec("
        UPDATE exam_papers ep
        JOIN subjects s ON ep.subject_id = s.subject_id
        SET ep.is_aggregate_contributor = 0
        WHERE s.subject_code IN ('CAPE', 'P4-CAPE', 'P5-CAPE', 'P6-CAPE', 'P7-CAPE', 'KIS', 'P4-KIS', 'P5-KIS', 'P6-KIS', 'P7-KIS', 'P3-LL', 'P3-CAPE')
           OR LOWER(s.subject_name) LIKE '%kiswahili%'
           OR LOWER(s.subject_name) LIKE '%creative arts%'
           OR LOWER(s.subject_name) LIKE '%physical ed%'
    ");

    // Sync marks
    $db->exec("
        UPDATE exam_marks em
        JOIN exam_papers ep ON em.exam_paper_id = ep.exam_paper_id
        SET em.is_aggregate_contributor = ep.is_aggregate_contributor
    ");

    echo "[OK] Updated auxiliary subjects to is_aggregate_contributor = 0 where applicable.\n";
    echo "--- MIGRATION COMPLETED SUCCESSFULLY ---\n";
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
