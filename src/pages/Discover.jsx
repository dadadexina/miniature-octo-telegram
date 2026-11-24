import { useEffect, useMemo, useState } from 'react'
import DiscoverGlobe from '../components/DiscoverGlobe'
import { fetchLocations } from '../lib/locations'
import { isUuid } from '../lib/messages'
import { useStore } from '../store'

function DiscoverHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center border-b border-eink-divider bg-eink-bar px-3 text-eink-ink backdrop-blur">
      <div className="w-16" />
      <h1 className="flex-1 truncate text-center text-[16px] font-medium tracking-[0.18em]">关系网</h1>
      <div className="w-16" />
    </header>
  )
}

function makePeople(friends, meId, displayNameOf) {
  const map = new Map()
  ;(friends || []).forEach((friend) => {
    if (!friend?.id || friend.id === meId || map.has(friend.id)) return
    map.set(friend.id, {
      id: friend.id,
      name: displayNameOf(friend.id) || friend.nickname || '朋友',
      avatarUrl: friend.avatarUrl || '',
    })
  })
  return [...map.values()]
}

function useLinks(people, meId, friendsOf) {
  return useMemo(() => {
    const ids = new Set(people.map((person) => person.id))
    const pairs = new Map()
    people.forEach((person) => pairs.set(`me:${person.id}`, [meId, person.id]))
    people.forEach((person) => {
      friendsOf(person.id).forEach((other) => {
        if (other.id === meId || other.id === person.id || !ids.has(other.id)) return
        const forward = person.id < other.id
        const key = forward ? `${person.id}:${other.id}` : `${other.id}:${person.id}`
        pairs.set(key, forward ? [person.id, other.id] : [other.id, person.id])
      })
    })
    return [...pairs.values()]
  }, [people, meId, friendsOf])
}

function useLocatedPeople(people, meId) {
  const [locations, setLocations] = useState(() => new Map())
  const ids = useMemo(() => {
    const set = new Set(people.map((person) => person.id))
    if (meId) set.add(meId)
    return [...set].filter(Boolean).sort()
  }, [people, meId])
  const key = ids.join(',')

  useEffect(() => {
    if (!isUuid(meId)) return undefined
    let alive = true
    fetchLocations(key.split(',').filter(Boolean)).then((res) => {
      if (!alive || !res.ok) return
      const next = new Map()
      ;(res.locations || []).forEach((location) => {
        if (location.visible || location.userId === meId) next.set(location.userId, location)
      })
      setLocations(next)
    })
    return () => {
      alive = false
    }
  }, [key, meId])

  const located = useMemo(
    () =>
      people.map((person) => {
        const location = locations.get(person.id)
        return location
          ? {
              ...person,
              lat: location.lat,
              lng: location.lng,
              place: location.label,
              located: true,
              updatedAt: location.updatedAt,
            }
          : { ...person, located: false }
      }),
    [people, locations]
  )

  return { located, meLocation: locations.get(meId) }
}

function DiscoverView({ people, links, meId, meName, meCoords }) {
  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <DiscoverHeader />
      <div className="min-h-0 flex-1">
        <DiscoverGlobe
          people={people}
          links={links}
          meId={meId}
          meName={meName}
          meCoords={meCoords}
        />
      </div>
    </div>
  )
}

function CloudDiscover() {
  const { currentUser, profile, displayNameOf, friendsOf } = useStore()
  const meId = currentUser.id
  const meName = profile?.nickname || currentUser.nickname
  const people = useMemo(
    () => makePeople(friendsOf(meId), meId, displayNameOf),
    [friendsOf, meId, displayNameOf]
  )
  const links = useLinks(people, meId, friendsOf)
  const { located, meLocation } = useLocatedPeople(people, meId)

  return (
    <DiscoverView people={located} links={links} meId={meId} meName={meName} meCoords={meLocation} />
  )
}

function LocalDiscover() {
  const { currentUser, profile, displayNameOf, friendsOf } = useStore()
  const meId = currentUser.id
  const meName = profile?.nickname || currentUser.nickname
  const people = useMemo(
    () => makePeople(friendsOf(meId), meId, displayNameOf),
    [friendsOf, meId, displayNameOf]
  )
  const links = useLinks(people, meId, friendsOf)

  return <DiscoverView people={people} links={links} meId={meId} meName={meName} meCoords={null} />
}

export default function Discover() {
  const { currentUser } = useStore()
  if (!currentUser) return null
  return isUuid(currentUser.id) ? <CloudDiscover /> : <LocalDiscover />
}
