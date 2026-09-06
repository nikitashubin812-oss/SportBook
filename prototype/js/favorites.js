/**
 * Избранные площадки: данные в БД, API /api/favorites/*.
 * _favoriteVenueIds: undefined — не загружали; null — не арендатор; Set — id избранного.
 */
(function () {
    let _favoriteVenueIds = undefined;

    async function refreshFavoriteVenueIds() {
        if (typeof API === 'undefined' || !API.Auth.isAuthenticated()) {
            _favoriteVenueIds = null;
            return;
        }
        try {
            const u = await API.getCurrentUser();
            if (u.role !== 'renter') {
                _favoriteVenueIds = null;
                return;
            }
            const data = await API.getFavoriteVenueIds();
            _favoriteVenueIds = new Set((data.venue_ids || []).map(Number));
        } catch {
            _favoriteVenueIds = new Set();
        }
    }

    window.VenueFavorites = {
        invalidate() {
            _favoriteVenueIds = undefined;
        },

        async ensureLoaded() {
            if (_favoriteVenueIds === undefined) {
                await refreshFavoriteVenueIds();
            }
        },

        /** Показывать ли кнопку «в избранное» (только арендатор) */
        canUseFavorites() {
            return _favoriteVenueIds instanceof Set;
        },

        isFavorite(venueId) {
            return _favoriteVenueIds instanceof Set && _favoriteVenueIds.has(Number(venueId));
        },

        async toggle(venueId) {
            await this.ensureLoaded();
            if (!(_favoriteVenueIds instanceof Set)) {
                throw new Error('Избранное доступно только арендаторам. Войдите под соответствующей учётной записью.');
            }
            const id = Number(venueId);
            if (_favoriteVenueIds.has(id)) {
                await API.removeFavoriteVenue(id);
                _favoriteVenueIds.delete(id);
                return false;
            }
            await API.addFavoriteVenue(id);
            _favoriteVenueIds.add(id);
            return true;
        }
    };
})();
