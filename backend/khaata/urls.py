"""
Root URL configuration for the Khaata project.
All application routes are namespaced under /api/v1/.
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("khaata.api_urls")),
]

handler404 = "khaata.core.views.handler404"
handler500 = "khaata.core.views.handler500"
