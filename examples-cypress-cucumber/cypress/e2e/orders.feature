@feature:orders
Feature: Orders API

  Rule: Users can be listed

    @smoke
    Scenario: List users
      When I request the users
      Then I see these users:
        | id | name |
        | 1  | Asha |

  Rule: Orders can be placed

    @P0 @blocker @story:SHOP-12
    Scenario: Place an order
      When I post an order:
        """
        {"item":"book","qty":1}
        """
      Then the order is accepted

    Scenario: Gift wrapping
      When I post an order for a gift
      Then the gift is wrapped

    Scenario: Cancel an order
      When I cancel order 7
