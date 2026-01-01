import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { getArticles } from '../services/api';
import ArticleCard from '../components/ArticleCard';
import { Loader2 } from 'lucide-react';

export default function Dashboard({ search }) {
    const { ref, inView } = useInView();

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        status
    } = useInfiniteQuery({
        queryKey: ['articles', search],
        queryFn: ({ pageParam = 1 }) => getArticles(pageParam, search),
        getNextPageParam: (lastPage) => {
            return lastPage.pagination.page < lastPage.pagination.pages ? lastPage.pagination.page + 1 : undefined;
        }
    });

    React.useEffect(() => {
        if (inView && hasNextPage) {
            fetchNextPage();
        }
    }, [inView, fetchNextPage, hasNextPage]);

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6 text-white">Latest News</h1>

            {status === 'pending' ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
            ) : status === 'error' ? (
                <div className="text-red-500">Error fetching articles</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {data.pages.map((page) =>
                            page.data.map((article) => (
                                <ArticleCard key={article.id} article={article} />
                            ))
                        )}
                    </div>

                    <div ref={ref} className="flex justify-center py-8">
                        {isFetchingNextPage && <Loader2 className="animate-spin text-blue-500" size={24} />}
                    </div>
                </>
            )}
        </div>
    );
}
