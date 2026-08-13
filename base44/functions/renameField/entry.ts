import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Renames a custom field's token (field_name) and/or label across the whole system.
// When the token changes, every {{old}} placeholder, mapping key, calculation input,
// and stored field reference is rewritten to the new token so nothing breaks downstream.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { field_id, old_name, new_name, new_label } = await req.json();
    if (!field_id) return Response.json({ error: 'field_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const changed = [];

    // 1. Update the CustomField record itself.
    const fieldUpdate = {};
    if (typeof new_name === 'string') fieldUpdate.field_name = new_name;
    if (typeof new_label === 'string') fieldUpdate.label = new_label;
    await svc.entities.CustomField.update(field_id, fieldUpdate);

    const nameChanged = old_name && new_name && old_name !== new_name;
    if (!nameChanged) {
      return Response.json({ ok: true, name_changed: false, updated: [] });
    }

    // Replace {{old}} tokens (and bare old references) inside a JSON string blob.
    const rewriteTokens = (str) => {
      if (!str || typeof str !== 'string') return str;
      let out = str;
      // {{old}} and {{ old }} placeholder styles
      out = out.split(`{{${old_name}}}`).join(`{{${new_name}}}`);
      out = out.split(`{{ ${old_name} }}`).join(`{{ ${new_name} }}`);
      return out;
    };

    // Replace a value inside a JSON array of plain strings (e.g. filter field references).
    const rewriteJsonArrayValues = (jsonStr) => {
      if (!jsonStr) return jsonStr;
      try {
        const arr = JSON.parse(jsonStr);
        if (!Array.isArray(arr)) return jsonStr;
        let touched = false;
        const next = arr.map((v) => {
          if (v === old_name) { touched = true; return new_name; }
          return v;
        });
        return touched ? JSON.stringify(next) : jsonStr;
      } catch { return jsonStr; }
    };

    // Rewrite condition field references where field === old_name. Handles both the
    // legacy flat array [{field, operator, value}] and the newer nested group tree
    // { type: 'group', match, name, children: [ ...condition or nested group nodes ] }.
    const rewriteConditions = (jsonStr) => {
      if (!jsonStr) return jsonStr;
      let root;
      try {
        root = JSON.parse(jsonStr);
      } catch { return jsonStr; }

      let touched = false;
      const rewriteNode = (node) => {
        // Legacy flat shape: an array of plain condition objects.
        if (Array.isArray(node)) {
          return node.map((el) => {
            if (el && el.field === old_name) { touched = true; return { ...el, field: new_name }; }
            return el;
          });
        }
        if (node && typeof node === 'object') {
          if (node.type === 'condition') {
            if (node.field === old_name) { touched = true; return { ...node, field: new_name }; }
            return node;
          }
          if (node.type === 'group') {
            return {
              ...node,
              children: Array.isArray(node.children) ? node.children.map(rewriteNode) : node.children,
            };
          }
        }
        return node;
      };

      const next = rewriteNode(root);
      return touched ? JSON.stringify(next) : jsonStr;
    };

    // 2. LeadByteConnector payload templates.
    const lbConns = await svc.entities.LeadByteConnector.list();
    for (const c of lbConns) {
      const patch = {};
      const newTemplate = rewriteTokens(c.payload_template);
      if (newTemplate !== c.payload_template) patch.payload_template = newTemplate;
      const newConds = rewriteConditions(c.filter_conditions);
      if (newConds !== c.filter_conditions) patch.filter_conditions = newConds;
      if (Object.keys(patch).length) {
        await svc.entities.LeadByteConnector.update(c.id, patch);
        changed.push(`LeadByteConnector:${c.api_name}`);
      }
    }

    // 3. ApiConnector payload templates, conditions, and trigger overrides.
    const apiConns = await svc.entities.ApiConnector.list();
    for (const c of apiConns) {
      const patch = {};
      const newTemplate = rewriteTokens(c.payload_template);
      if (newTemplate !== c.payload_template) patch.payload_template = newTemplate;
      const newOverrides = rewriteTokens(c.trigger_data_overrides);
      if (newOverrides !== c.trigger_data_overrides) patch.trigger_data_overrides = newOverrides;
      const newConds = rewriteConditions(c.filter_conditions);
      if (newConds !== c.filter_conditions) patch.filter_conditions = newConds;
      if (Object.keys(patch).length) {
        await svc.entities.ApiConnector.update(c.id, patch);
        changed.push(`ApiConnector:${c.name}`);
      }
    }

    // 4. CustomCalculation input/output token references.
    const calcs = await svc.entities.CustomCalculation.list();
    for (const c of calcs) {
      const patch = {};
      if (c.input_field === old_name) patch.input_field = new_name;
      if (c.output_token === old_name) patch.output_token = new_name;
      const newConfig = rewriteTokens(c.config);
      if (newConfig !== c.config) patch.config = newConfig;
      if (Object.keys(patch).length) {
        await svc.entities.CustomCalculation.update(c.id, patch);
        changed.push(`CustomCalculation:${c.output_token}`);
      }
    }

    // 5. FieldMapping target references.
    const mappings = await svc.entities.FieldMapping.list();
    for (const m of mappings) {
      if (m.target_field === old_name) {
        await svc.entities.FieldMapping.update(m.id, { target_field: new_name });
        changed.push(`FieldMapping:${m.source_field}`);
      }
    }

    return Response.json({ ok: true, name_changed: true, updated: changed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});