export default function ScoreBar({ teams, targetScore, myTeam }: {
  teams: { a: { score: number; playerIds: [string, string] }; b: { score: number; playerIds: [string, string] } };
  targetScore: number;
  myTeam: 'a' | 'b';
}) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2.5 text-[0.8em] font-bold" style={{ background: 'rgba(240,194,127,.04)', borderBottom: '1px solid rgba(240,194,127,.06)' }}>
      <span style={{ color: 'var(--shallow-water)' }}>
        ● A {teams.a.score}
        {myTeam === 'a' && (
          <span className="text-[0.55em] ml-1 font-bold rounded-[3px] px-1.5 py-[1px]" style={{ background: 'rgba(240,194,127,.1)', color: 'var(--pearl)' }}>YOU</span>
        )}
      </span>
      <span className="text-[0.7em]" style={{ color: 'rgba(232,230,240,.15)' }}>vs</span>
      <span style={{ color: 'var(--coral)' }}>
        ● B {teams.b.score}
        {myTeam === 'b' && (
          <span className="text-[0.55em] ml-1 font-bold rounded-[3px] px-1.5 py-[1px]" style={{ background: 'rgba(240,194,127,.1)', color: 'var(--pearl)' }}>YOU</span>
        )}
      </span>
      <span className="text-[0.65em] font-semibold ml-auto" style={{ color: 'rgba(232,230,240,.12)' }}>to {targetScore}</span>
    </div>
  );
}
