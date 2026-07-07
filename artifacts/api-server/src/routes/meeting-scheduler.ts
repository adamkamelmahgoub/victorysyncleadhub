import { Router } from "express";
import { db } from "@workspace/db";
import { meetingEventTypesTable, bookingAppointmentsTable, insertMeetingEventTypeSchema, insertBookingSchema } from "@workspace/db/schema";
import { eq, desc, gte, lte, and } from "drizzle-orm";

const router = Router();

router.get("/meeting/event-types", async (_req, res) => {
  const types = await db.select().from(meetingEventTypesTable).orderBy(meetingEventTypesTable.durationMinutes);
  res.json(types);
});

router.post("/meeting/event-types", async (req, res) => {
  const parsed = insertMeetingEventTypeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const slug = (parsed.data.title || "meeting").toLowerCase().replace(/[^a-z0-9]/g, "-");
  const [type] = await db.insert(meetingEventTypesTable).values({ ...parsed.data, slug }).returning();
  res.status(201).json(type);
});

router.get("/meeting/event-types/:id", async (req, res) => {
  const [type] = await db.select().from(meetingEventTypesTable).where(eq(meetingEventTypesTable.id, parseInt(req.params.id)));
  if (!type) return res.status(404).json({ error: "Not found" });
  res.json(type);
});

router.get("/meeting/event-types/slug/:slug", async (req, res) => {
  const [type] = await db.select().from(meetingEventTypesTable).where(eq(meetingEventTypesTable.slug, req.params.slug));
  if (!type) return res.status(404).json({ error: "Not found" });
  res.json(type);
});

router.patch("/meeting/event-types/:id", async (req, res) => {
  const [updated] = await db.update(meetingEventTypesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(meetingEventTypesTable.id, parseInt(req.params.id))).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/meeting/event-types/:id", async (req, res) => {
  await db.delete(meetingEventTypesTable).where(eq(meetingEventTypesTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

router.get("/meeting/appointments", async (req, res) => {
  const { from, to, status } = req.query as Record<string, string>;
  const conditions: any[] = [];
  if (from) conditions.push(gte(bookingAppointmentsTable.startAt, new Date(from)));
  if (to) conditions.push(lte(bookingAppointmentsTable.startAt, new Date(to)));
  if (status) conditions.push(eq(bookingAppointmentsTable.status, status));
  const appointments = await db.select().from(bookingAppointmentsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookingAppointmentsTable.startAt));
  res.json(appointments);
});

router.post("/meeting/appointments", async (req, res) => {
  const parsed = insertBookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [appt] = await db.insert(bookingAppointmentsTable).values(parsed.data).returning();
  res.status(201).json(appt);
});

router.patch("/meeting/appointments/:id", async (req, res) => {
  const [updated] = await db.update(bookingAppointmentsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(bookingAppointmentsTable.id, parseInt(req.params.id))).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.get("/meeting/slots", async (req, res) => {
  const { eventTypeId, date } = req.query as Record<string, string>;
  if (!eventTypeId || !date) return res.status(400).json({ error: "eventTypeId and date required" });
  const [type] = await db.select().from(meetingEventTypesTable).where(eq(meetingEventTypesTable.id, parseInt(eventTypeId)));
  if (!type) return res.status(404).json({ error: "Event type not found" });
  const day = new Date(date);
  const startHour = parseInt(type.availableStart.split(":")[0]);
  const endHour = parseInt(type.availableEnd.split(":")[0]);
  const slots: { time: string; available: boolean }[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += type.durationMinutes) {
      const slotStart = new Date(day);
      slotStart.setHours(h, m, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + type.durationMinutes * 60000);
      const conflicts = await db.select().from(bookingAppointmentsTable).where(
        and(
          eq(bookingAppointmentsTable.eventTypeId, parseInt(eventTypeId)),
          eq(bookingAppointmentsTable.status, "confirmed"),
          gte(bookingAppointmentsTable.startAt, slotStart),
          lte(bookingAppointmentsTable.startAt, slotEnd)
        )
      );
      slots.push({ time: slotStart.toISOString(), available: conflicts.length === 0 });
    }
  }
  res.json(slots);
});

export default router;
