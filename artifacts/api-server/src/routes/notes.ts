import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, notesTable, leadsTable } from "@workspace/db";
import {
  ListLeadNotesParams,
  CreateLeadNoteParams,
  CreateLeadNoteBody,
  DeleteLeadNoteParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leads/:id/notes", async (req, res): Promise<void> => {
  const params = ListLeadNotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const notes = await db
    .select()
    .from(notesTable)
    .where(eq(notesTable.leadId, params.data.id))
    .orderBy(desc(notesTable.createdAt));

  res.json(
    notes.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    }))
  );
});

router.post("/leads/:id/notes", async (req, res): Promise<void> => {
  const params = CreateLeadNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = CreateLeadNoteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.id))
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [note] = await db
    .insert(notesTable)
    .values({ leadId: params.data.id, content: body.data.content })
    .returning();

  res.status(201).json({
    ...note,
    createdAt: note.createdAt.toISOString(),
  });
});

router.delete("/leads/:leadId/notes/:noteId", async (req, res): Promise<void> => {
  const params = DeleteLeadNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [note] = await db
    .delete(notesTable)
    .where(and(eq(notesTable.id, params.data.noteId), eq(notesTable.leadId, params.data.leadId)))
    .returning();

  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
