app.use(goalsRoutes({ db, requireAuth }));
app.use(accomplishmentsRoutes({ db, requireAuth }));
app.use(tasksRoutes({ db, requireAuth }));
