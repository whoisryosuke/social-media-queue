import { useStore } from '@nanostores/react'
import { useEffect } from 'react'
import { loadAccounts } from '../../stores/accounts'
import { $draftPosts, $postsLoaded, $queuePosts, loadPosts, refreshPostsAction } from '../../stores/posts'
import EmptyState from '../ui/EmptyState'
import Spinner from '../ui/Spinner'
import PostList from './PostList'

function useAutoRefresh(): void {
  useEffect(() => {
    void loadPosts()
    void loadAccounts()
    const interval = setInterval(() => void refreshPostsAction(), 30_000)
    const onFocus = (): void => {
      void refreshPostsAction()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
}

export function QueueView(): JSX.Element {
  useAutoRefresh()
  const posts = useStore($queuePosts)
  const loaded = useStore($postsLoaded)
  if (!loaded) return <Spinner label="Loading queue" />
  if (posts.length === 0) {
    return (
      <EmptyState title="Nothing scheduled" description="Use New post to schedule something, or check Drafts." />
    )
  }
  return (
    <>
      <h1>Scheduled posts</h1>
      <PostList posts={posts} mode="queue" />
    </>
  )
}

export function DraftsView(): JSX.Element {
  useAutoRefresh()
  const posts = useStore($draftPosts)
  const loaded = useStore($postsLoaded)
  if (!loaded) return <Spinner label="Loading drafts" />
  if (posts.length === 0) {
    return <EmptyState title="No drafts" description="Save a post as draft from the composer." />
  }
  return (
    <>
      <h1>Drafts</h1>
      <PostList posts={posts} mode="drafts" />
    </>
  )
}
