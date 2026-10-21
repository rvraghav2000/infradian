import { useState } from 'react';
import { iacApi } from '../../services/iacApi';
import { Btn, Chip, Field, Section, useTokens } from './ui';

export default function DeployTab({ theme, files, iac, workspaceId, me, sync, canPlan, canApply }) {
    const t = useTokens(theme);
    const [busy, setBusy] = useState(null);
    const [log, setLog] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [git, setGit] = useState({ message: 'Update infrastructure', remote: '', push: false });
    const [imp, setImp] = useState({ url: '', ref: '', subdir: '' });
    const [gitLog, setGitLog] = useState('');
    const blocking = sync.analysis?.blocking?.length || 0;

    const run = async (action) => {
        setBusy(action); setLog(`$ ${iac.tool} ${action} …\n(first run downloads provider plugins — this can take a few minutes)`);
        try {
            const r = await iacApi.run(action, workspaceId, files, iac.tool, action === 'apply' && confirm);
            setLog(r.output || (r.ok ? 'OK' : 'Failed'));
            if (r.ok === false && r.exit_code === 127) setLog(l => `${l}\nInstall/start Docker on the API host.`);
        } catch (e) { setLog(e.message); }
        setBusy(null);
    };

    const commit = async () => {
        setBusy('git');
        try {
            const r = await iacApi.gitCommit({ workspace: workspaceId, files, message: git.message, remote: git.remote || null, push: git.push });
            setGitLog(`${r.committed ? `Committed ${r.sha}` : 'Nothing new to commit'}${r.pushed ? ' and pushed' : ''}\n${r.output || ''}`);
        } catch (e) { setGitLog(e.message); }
        setBusy(null);
    };

    const importRepo = async () => {
        setBusy('import');
        try {
            const r = await iacApi.importGit(imp.url, imp.ref, imp.subdir);
            await sync.importFiles(r.files);
            setGitLog(`Imported ${r.nodes.length} resources from ${Object.keys(r.files).length} files.`);
        } catch (e) { setGitLog(e.message); }
        setBusy(null);
    };

    return (
        <div style={{ overflowY: 'auto', height: '100%' }}>
            <Section t={t} title={`Run ${iac.tool === 'opentofu' ? 'OpenTofu' : 'Terraform'} (in Docker)`}
                right={<Chip color={me?.apply_enabled ? t.warn : t.sub}>{me?.apply_enabled ? 'apply enabled' : 'apply disabled'}</Chip>}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Btn t={t} onClick={() => run('validate')} disabled={!canPlan || !!busy}>Validate</Btn>
                    <Btn t={t} kind="primary" onClick={() => run('plan')} disabled={!canPlan || !!busy}>Plan</Btn>
                    <Btn t={t} kind="danger" onClick={() => run('apply')} disabled={!canApply || !confirm || !!busy || !me?.apply_enabled || blocking > 0}
                        title={!me?.apply_enabled ? 'Server has INFRADIAN_ALLOW_APPLY unset' : blocking ? 'Blocked by policy' : 'Applies the last saved plan'}>
                        Apply
                    </Btn>
                    <label style={{ fontSize: 11, color: t.sub }}>
                        <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> I reviewed the plan
                    </label>
                </div>
                {blocking > 0 && <div style={{ fontSize: 11, color: t.bad, marginTop: 6 }}>⛔ {blocking} policy violation(s) block apply — see Governance.</div>}
                {!canPlan && <div style={{ fontSize: 11, color: t.sub, marginTop: 6 }}>Your role cannot run plans.</div>}
                <pre style={{
                    marginTop: 8, padding: 10, borderRadius: 10, background: t.code, color: t.text, border: `1px solid ${t.border}`,
                    fontSize: 11, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', minHeight: 60,
                }}>{log || 'Output appears here.'}</pre>
                <div style={{ fontSize: 10, color: t.sub }}>Destroy is intentionally not available from the platform.</div>
            </Section>

            <Section t={t} title="Git — save generated code">
                <div style={{ display: 'grid', gap: 4 }}>
                    <Field t={t} value={git.message} onChange={x => setGit(g => ({ ...g, message: x }))} placeholder="commit message" />
                    <Field t={t} value={git.remote} onChange={x => setGit(g => ({ ...g, remote: x }))} placeholder="remote URL (GitHub / GitLab / Bitbucket / Azure DevOps) — only needed to push" />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Btn t={t} onClick={commit} disabled={!!busy}>Commit</Btn>
                        <label style={{ fontSize: 11, color: t.sub }}>
                            <input type="checkbox" checked={git.push} disabled={!canApply} onChange={e => setGit(g => ({ ...g, push: e.target.checked }))} /> also push (deployer+)
                        </label>
                    </div>
                </div>
            </Section>

            <Section t={t} title="Reverse-engineer from a Git repo">
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 4 }}>
                    <Field t={t} value={imp.url} onChange={x => setImp(i => ({ ...i, url: x }))} placeholder="https://github.com/org/infra.git" />
                    <Field t={t} value={imp.ref} onChange={x => setImp(i => ({ ...i, ref: x }))} placeholder="branch" />
                    <Field t={t} value={imp.subdir} onChange={x => setImp(i => ({ ...i, subdir: x }))} placeholder="subdir" />
                    <Btn t={t} onClick={importRepo} disabled={!imp.url || !!busy}>Import</Btn>
                </div>
                <div style={{ fontSize: 10, color: t.sub, marginTop: 4 }}>Reads .tf files only (shallow clone); nothing is executed.</div>
            </Section>
            {gitLog && <pre style={{ fontSize: 11, color: t.sub, whiteSpace: 'pre-wrap' }}>{gitLog}</pre>}
        </div>
    );
}
