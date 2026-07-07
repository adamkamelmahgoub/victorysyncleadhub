import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useGetForm, getGetFormQueryKey, useUpdateForm } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Trash2, GripVertical, Copy, Check, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { asArray } from "@/lib/data-shape";

interface FormField {
  id: string;
  label: string;
  fieldType: string;
  required: boolean;
  order: number;
  placeholder: string | null;
  options: string[];
  mappedLeadField: string | null;
}

const FIELD_TYPES = ["text", "email", "tel", "number", "textarea", "select", "checkbox"];
const LEAD_FIELD_MAP = [
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "company", label: "Company" },
  { value: "title", label: "Job Title" },
];

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function FormEditor() {
  const [, params] = useRoute("/forms/:id");
  const id = parseInt(params?.id ?? "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: form, isLoading } = useGetForm(id, { query: { enabled: !!id, queryKey: getGetFormQueryKey(id) } });
  const updateForm = useUpdateForm();

  const [fields, setFields] = useState<FormField[]>([]);
  const [formName, setFormName] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (form) {
      setFields(asArray<FormField>(form.fields));
      setFormName(form.name);
      setSuccessMsg(form.successMessage ?? "");
    }
  }, [form]);

  function addField() {
    const newField: FormField = {
      id: generateId(),
      label: "New Field",
      fieldType: "text",
      required: false,
      order: fields.length,
      placeholder: null,
      options: [],
      mappedLeadField: null,
    };
    setFields((f) => [...f, newField]);
    setDirty(true);
  }

  function updateField(id: string, patch: Partial<FormField>) {
    setFields((f) => f.map((field) => field.id === id ? { ...field, ...patch } : field));
    setDirty(true);
  }

  function removeField(id: string) {
    setFields((f) => f.filter((field) => field.id !== id));
    setDirty(true);
  }

  function save() {
    updateForm.mutate(
      { id, data: { name: formName, fields, successMessage: successMsg } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFormQueryKey(id) });
          setDirty(false);
          toast({ title: "Form saved" });
        },
      }
    );
  }

  function copyEmbed() {
    if (!form?.embedCode) return;
    navigator.clipboard.writeText(form.embedCode);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
    toast({ title: "Embed code copied!" });
  }

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!form) {
    return <div className="text-center py-20 text-muted-foreground">Form not found.</div>;
  }

  return (

      <div className="space-y-5">
        <div className="flex items-center gap-3">
            <Link href="/forms">
            <Button variant="ghost" size="icon" className="w-8 h-8"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <Input
            className="text-lg font-bold bg-transparent border-transparent hover:border-border focus:border-border h-9 px-2 w-80"
            value={formName}
            onChange={(e) => { setFormName(e.target.value); setDirty(true); }}
          />
          <span className="text-xs text-muted-foreground">{form.submissionCount} submissions</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyEmbed}>
              {copiedEmbed ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedEmbed ? "Copied!" : "Copy Embed Code"}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={save} disabled={!dirty || updateForm.isPending}>
              <Save className="w-3.5 h-3.5" />
              {updateForm.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Field builder */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Fields</p>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={addField}>
                <Plus className="w-3.5 h-3.5" /> Add Field
              </Button>
            </div>
            {fields.length === 0 && (
              <Card className="p-8 border border-dashed border-border bg-card text-center">
                <p className="text-sm text-muted-foreground">No fields yet. Add your first field.</p>
                <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={addField}>
                  <Plus className="w-3.5 h-3.5" /> Add Field
                </Button>
              </Card>
            )}
            <div className="space-y-2">
              {fields.map((field) => (
                <Card key={field.id} className="p-4 border border-border bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground">Label</Label>
                        <Input
                          className="mt-0.5 h-8 text-sm"
                          value={field.label}
                          onChange={(e) => updateField(field.id, { label: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Type</Label>
                        <Select value={field.fieldType} onValueChange={(v) => updateField(field.id, { fieldType: v })}>
                          <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive self-end" onClick={() => removeField(field.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Placeholder</Label>
                      <Input
                        className="mt-0.5 h-8 text-sm"
                        value={field.placeholder ?? ""}
                        onChange={(e) => updateField(field.id, { placeholder: e.target.value || null })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Maps to</Label>
                      <Select value={field.mappedLeadField ?? ""} onValueChange={(v) => updateField(field.id, { mappedLeadField: v || null })}>
                        <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue placeholder="Custom field" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Custom field</SelectItem>
                          {LEAD_FIELD_MAP.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Switch
                      checked={field.required}
                      onCheckedChange={(v) => updateField(field.id, { required: v })}
                      className="scale-75"
                    />
                    <Label className="text-xs text-muted-foreground cursor-pointer">Required</Label>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Preview + embed */}
          <div className="lg:col-span-2 space-y-4">
            {/* Form preview */}
            <Card className="p-5 border border-border bg-card">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Preview</p>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">{formName}</h3>
                {fields.map((field) => (
                  <div key={field.id}>
                    <label className="text-xs font-medium text-foreground">
                      {field.label}{field.required && <span className="text-destructive ml-1">*</span>}
                    </label>
                    {field.fieldType === "textarea" ? (
                      <div className="mt-1 h-16 rounded-md border border-border bg-background" />
                    ) : field.fieldType === "select" ? (
                      <div className="mt-1 h-8 rounded-md border border-border bg-background flex items-center px-2">
                        <span className="text-xs text-muted-foreground">{field.placeholder ?? "Select..."}</span>
                      </div>
                    ) : field.fieldType === "checkbox" ? (
                      <div className="mt-1 flex items-center gap-2">
                        <div className="w-4 h-4 rounded border border-border bg-background" />
                        <span className="text-xs text-muted-foreground">{field.placeholder ?? field.label}</span>
                      </div>
                    ) : (
                      <div className="mt-1 h-8 rounded-md border border-border bg-background flex items-center px-2">
                        <span className="text-xs text-muted-foreground">{field.placeholder ?? ""}</span>
                      </div>
                    )}
                  </div>
                ))}
                {fields.length > 0 && (
                  <div className="pt-1">
                    <div className="h-8 rounded-md bg-primary flex items-center justify-center">
                      <span className="text-xs font-medium text-primary-foreground">Submit</span>
                    </div>
                  </div>
                )}
                {fields.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Add fields to preview</p>
                )}
              </div>
            </Card>

            {/* Success message */}
            <Card className="p-5 border border-border bg-card">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Success Message</Label>
              <Input
                className="mt-2 text-sm"
                value={successMsg}
                onChange={(e) => { setSuccessMsg(e.target.value); setDirty(true); }}
              />
            </Card>

            {/* Embed code */}
            <Card className="p-5 border border-border bg-card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Embed Code</p>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={copyEmbed}>
                  {copiedEmbed ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                  Copy
                </Button>
              </div>
              <pre className="text-xs text-muted-foreground bg-muted/40 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                {form.embedCode ?? "Save the form to generate an embed code."}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">Paste this snippet on any webpage to display your lead capture form.</p>
            </Card>
          </div>
        </div>
      </div>

  );
}
