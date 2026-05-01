import PlayerCard from '../components/sports/PlayerCard'
import { players } from '../data/sportsAppData'

export default function PlayersAppPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-950">اللاعبون</h1>
        <p className="text-[16px] font-bold text-slate-500">بطاقات سريعة لمتابعة كل لاعب</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {players.map((player) => <PlayerCard key={player.id} player={player} />)}
      </div>
    </div>
  )
}
