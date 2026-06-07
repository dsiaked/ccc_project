declare global {
  interface KakaoPlaceSearchResult {
    id: string;
    place_name: string;
    road_address_name?: string;
    address_name?: string;
    x: string;
    y: string;
  }

  interface KakaoAddressSearchResult {
    address_name: string;
    x: string;
    y: string;
    road_address?: {
      address_name?: string;
      building_name?: string;
    };
  }

  interface Window {
    kakao?: {
      maps?: {
        load: (callback: () => void) => void;
        services?: {
          Places: new () => {
            keywordSearch: (
              keyword: string,
              callback: (
                result: KakaoPlaceSearchResult[],
                status: string
              ) => void
            ) => void;
          };
          Geocoder: new () => {
            addressSearch: (
              keyword: string,
              callback: (
                result: KakaoAddressSearchResult[],
                status: string
              ) => void
            ) => void;
          };
          Status: {
            OK: string;
          };
        };
      };
    };
  }
}

export {};
