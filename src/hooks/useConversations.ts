import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/useSession";
import { conversationKeys } from "@/hooks/conversation-keys";
import { fetchConversation, fetchConversations, fetchUnreadCount } from "@/services/conversations";

export function useConversations() {
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: conversationKeys.list,
    queryFn: ({ signal }) => fetchConversations(signal),
    enabled: !!userId,
  });
}

export function useConversation(id: string | null) {
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: conversationKeys.detail(id ?? ""),
    queryFn: ({ signal }) => fetchConversation(id as string, signal),
    enabled: !!userId && !!id,
  });
}

export function useUnreadCount() {
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: conversationKeys.unread,
    queryFn: ({ signal }) => fetchUnreadCount(signal),
    enabled: !!userId,
  });
}
